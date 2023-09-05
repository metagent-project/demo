import random
import re
import asyncio
import math

from typedefs import *
from services import send_chat_event

def exception_callback(task):
    if task.exception():
        print(PrintColors.RED + str(task.exception()) + PrintColors.END)
        raise task.exception()

class Mafia:
    werewolves_win_if_all_others_are_killed = True
    default_persona = "Please mimic Donald Trump."

    def __init__(self, game_profile):
        # the first player is reserved for the moderator
        self.user_id = game_profile.user_id
        self.initialize_status(game_profile.num_players - 1)
        self.moderator_name = game_profile.moderator
        self.interactive_players = game_profile.interactive_players
        self.player_names = [ name for name in game_profile.player_names if name != game_profile.moderator ]
        print(PrintColors.RED + str(self.player_names) + PrintColors.END)

        self.roles = self.generate_roles()
        print(PrintColors.RED + str(self.roles) + PrintColors.END)
        self.initialize_events(game_profile)

    def stop_game(self):
        self.run_game_task.cancel()
        print(PrintColors.RED + 'The game is stopped.' + PrintColors.END)

    def update_player_personas(self, agent_name, persona):
        if agent_name not in self.name_to_player_map:
            raise ValueError("Agent name " + agent_name + " not found")
        self.player_personas[self.name_to_player_map[agent_name]] = persona.persona
        print(PrintColors.RED
              + 'Set player '
              + str(self.name_to_player_map[agent_name] + 1)
              + ' persona to: '
              + persona.persona
              + PrintColors.END
        )

    def initialize_events(self, game_profile):
        self.name_to_player_map = {}
        for i in range(0, self.num_players):
            self.name_to_player_map[self.player_names[i]] = i;
        for i in range(0, len(self.interactive_players)):
            self.interactive_players[i] = self.name_to_player_map[self.interactive_players[i]]
        self.player_personas = [self.default_persona for i in range(0, self.num_players)]
        for key in game_profile.personas:
            self.update_player_personas(key, game_profile.personas[key])
        self.current_player = None
        self.agent_pending_messages = [ asyncio.Queue() for i in range(0, self.num_players) ]
        self.sent_message_count = [ 0 for i in range(0, self.num_players) ]
        # run the game
        self.run_game_task = asyncio.create_task(self.run_game())
        self.run_game_task.add_done_callback(exception_callback)

    async def agent_speak(self, agent_name, message):
        if agent_name not in self.name_to_player_map:
            error_msg = "Agent name " + agent_name + " not found" 
            print(PrintColors.RED + error_msg + PrintColors.END)
            return error_msg

        player = self.name_to_player_map[agent_name]
        await self.agent_pending_messages[player].put(message)
        return "ok"

    def add_src_agent_name(self, messages):
        for idx in range(len(messages)):
            content = messages[idx]['content']
            match = re.match('(Day|Night) [0-9]+, Player ([0-9]+):', content)
            if match:
                player = int(match.group(2)) - 1
                prefix = '<agent_name>' + self.player_names[player] + '</agent_name>'
                content = prefix + content

            match = re.match('(Day|Night) [0-9]+, Moderator:', content)
            if match:
                prefix = '<agent_name>' + self.moderator_name + '</agent_name>'
                content = prefix + content

            messages[idx]['content'] = content
        return messages

    async def send_chat_record(self, player, messages):
        messages_to_send = messages[self.sent_message_count[player] : ]
        if len(messages_to_send) == 0:
            return
        try:
            event = PersonaChatEvent(
                event_id = 'Moderator' + str(len(messages)),
                agent_name = self.moderator_name,
                event_type = 'agent_chat',
                target_agent_name = self.player_names[player],
                messages = self.add_src_agent_name(messages_to_send),
            )
        except Exception as e:
            print(e)

        await send_chat_event(self.user_id, event)
        self.sent_message_count[player] = len(messages)

    async def get_chat_response(self, player, messages):
        await self.send_chat_record(player, messages)

        message = await self.agent_pending_messages[player].get()
        return self.remove_header(message)
    
    def generate_history_messages(self, player):
        game_intro = """You are an experienced player of Mafia, a social deduction game. The game models a conflict between two groups: an informed minority (the werewolves) and and an uninformed majority (the villagers, seers, witches and hunters). At the start of the game, each player is secretly assigned a role (werewolf, villager, seer, witch or hunter). The game has two alternating phases: first, a night-phase, during which those with night-killing-powers may covertly kill other players, and second, a day-phase, in which all surviving players debate and vote to eliminate a suspect. The game continues until a faction achieves its win-condition; for the villagers, this means eliminating all the werewolves, while for the werewolves, this means eliminating either all the villagers or all the seers, witches and hunters.

At night, all players close their eyes. First, all werewolves acknowledge their accomplices, vote to pick a victim, and then close their eyes. Next, the seer open eyes and pick a player to reveal his/her real identity (the moderator only tells the identity to the seer but does not make it public), and then close eyes. Finally, the witches open eyes and know from the moderator which player is killed by the werewolves, and may decide to rescue him/her using the antidote. The witches may also decide to kill a player using the poison. Each witch has only one bottle of antidote and only one bottle of poison throughout the game.

At day, all players open their eyes. The moderator first announces which player is dead and the dead player may leave a last word. If the dead player is the hunter, the hunter may choose to kill one player, or choose to not kill anyone. If it is the first day, all players elect the police. The police has 1.5 votes and is the last to speak during the discussion. Next, from the next living player of the police or the dead player, every living player has a chance to discuss who are the werewolves. A player may accuse someone of being a werewolf and prompt others to vote to eliminate them. The real werewolves may lie to protect their identities. After the discussion, every living player has one vote to eliminate a player who is suspected to be a werewolf.
"""
        game_intro += "\n" + self.player_personas[player] + " Be concise.\n"
        game_intro += """
Tips:
- During discussion, werewolves should hide their real roles by pretending to be other roles. Do not reveal information only known by the werewolves. Some werewolves may claim to be the seer and self-nominate to the police. Some werewolves may support the werewolves who claim to be the seer. Some werewolves may be low-profile and pretend to be a villager by supporting the real seer.
- The seer should provide information on revealed identities, and should typically self-nominate to the police and make sure the police badge is transferred to good folks.
- During discussion, the witch and hunter should typically be low-profile by pretending to be villagers. Witches should rescue identified good folks and poison identified werewolves. Hunters should only kill identified werewolves.
- Among the good folks, the roles of decreasing importance is typically seers, witches, hunters and villagers.
"""
        game_intro += (
            "In this instance of Mafia, there are "
            + str(self.num_werewolves)
            + " werewolves, "
            + str(self.num_villagers)
            + " villagers, "
            + str(self.num_seers)
            + " seers, "
            + str(self.num_witches)
            + " witches, and "
            + str(self.num_hunters)
            + " hunters. The players are numbered from 1 to "
            + str(self.num_players)
            + ", and their roles have been randomly assigned at the beginning.\n"
        )
        game_intro += "Below are the past conversions during this game."

        messages = [{"role": "system", "content": game_intro}]
        for record in self.speaker_records:
            if (
                record["visibility"] == self.roles[player]
                or record["visibility"] == player
                or record["visibility"] == "all"
            ):
                speaker = record["speaker"]
                if type(speaker) is int:
                    speaker = "Player " + str(speaker + 1)
                content = (
                    ("Night " if self.is_night else "Day ")
                    + str(self.current_day)
                    + ", "
                    + speaker
                    + ": "
                    + record["content"]
                )
                messages.append({"role": "user", "content": content})
        return messages

    async def player_turn(self, player, command):
        self.speaker_records.append(
            {
                "day": self.current_day,
                "speaker": "Moderator",
                "visibility": player,
                "content": self.add_emojis("Now it is your turn. "
                + "You are player "
                + str(player + 1)
                + ", your role is "
                + self.roles[player]
                + ". "
                + command),
            }
        )
        messages = self.generate_history_messages(player)

        print('Waiting for player ' + str(player + 1) + ': ' + messages[-1]['content'])
        return await self.get_chat_response(player, messages)

    def remove_header(self, response):
        match = re.match('(Day|Night) [0-9]+, Player [0-9]+:', response)
        if match:
            return response[len(match.group(0)):].strip()
        match = re.match('(Day|Night) [0-9]+, Player [0-9]+ \([^)]*\):', response)
        if match:
            return response[len(match.group(0)):].strip()
        # match character names
        match = re.match('(Day|Night) [0-9]+, [a-zA-Z0-9 ]+ \([^)]*\):', response)
        if match:
            return response[len(match.group(0)):].strip()
        return response

    def parse_int(self, response):
        match = re.search("[0-9]+", response)
        if not match:
            return None
        return int(match.group(0))

    def list_living_players(self):
        return str([i + 1 for i in range(0, self.num_players) if self.alive[i]])

    def generate_roles(self):
        self.roles = list(range(0, self.num_players))
        random.shuffle(self.roles)
        for i in range(0, self.num_players):
            num = self.roles[i]
            if num < self.num_werewolves:
                self.roles[i] = "werewolf"
                continue
            num -= self.num_werewolves

            if num < self.num_villagers:
                self.roles[i] = "villager"
                continue
            num -= self.num_villagers

            if num < self.num_seers:
                self.roles[i] = "seer"
                continue
            num -= self.num_seers

            if num < self.num_witches:
                self.roles[i] = "witch"
                continue
            num -= self.num_witches

            if num < self.num_hunters:
                self.roles[i] = "hunter"
                continue
            raise ValueError("Unknown role exception")
        return self.roles

    def initialize_status(self, num_players):
        if num_players < 3:
            raise ValueError("Mafia cannot be played with <= " + str(num_players) + " players")
        self.num_players = num_players
        self.num_werewolves = math.ceil(num_players / 3)
        self.num_seers = 1 if num_players >= 6 else 0
        self.num_witches = 1 if num_players >= 6 else 0
        self.num_hunters = 1 if num_players >= 9 else 0
        self.num_villagers = self.num_players - self.num_werewolves - self.num_seers - self.num_witches - self.num_hunters

        self.alive = [True for i in range(0, self.num_players)]
        self.witches_poison_used = [False for i in range(0, self.num_players)]
        self.witches_antidote_used = [False for i in range(0, self.num_players)]
        self.current_day = 0
        self.is_night = True
        self.speaker_records = []
        self.dead_players_in_this_round = []
        self.police = None

    async def print_game_end_message(self, message):
        await self.speak("Moderator", "all", message)
        print(PrintColors.RED + message + PrintColors.END)
        await self.speak("Moderator", "all", "The roles are " + str(self.roles))
        print(PrintColors.RED + str(self.roles) + PrintColors.END)

    async def game_ended(self):
        if self.werewolves_win_if_all_others_are_killed:  # the hard mode for werewolves
            num_alive_villagers = 0
            for i in range(0, self.num_players):
                if self.roles[i] in ["villager", "seer", "witch", "hunter"] and self.alive[i]:
                    num_alive_villagers += 1
            if num_alive_villagers == 0:
                await self.print_game_end_message(
                    "All villagers, seers, witches and hunters are dead. Game ended. The werewolves 🐺🐺🐺 win 🏆🏆🏆."
                )
                return True
        else:  # the easy mode for werewolves
            num_alive_villagers = 0
            for i in range(0, self.num_players):
                if self.roles[i] == "villager" and self.alive[i]:
                    num_alive_villagers += 1
            if num_alive_villagers == 0:
                await self.print_game_end_message(
                    "All villagers are dead. Game ended. The werewolves 🐺🐺🐺 win 🏆🏆🏆."
                )
                return True

            if self.num_seers + self.num_witches + self.num_hunters > 0:
                num_alive_special_roles = 0
                for i in range(0, self.num_players):
                    if self.roles[i] in ["seer", "witch", "hunter"] and self.alive[i]:
                        num_alive_special_roles += 1
                if num_alive_special_roles == 0:
                    await self.print_game_end_message(
                        "All special roles are dead. Game ended. The werewolves win 🏆🏆🏆🏆🏆🏆."
                    )
                    return True

        num_alive_werewolves = 0
        for i in range(0, self.num_players):
            if self.roles[i] == "werewolf" and self.alive[i]:
                num_alive_werewolves += 1
        if num_alive_werewolves == 0:
            await self.print_game_end_message(
                "All werewolves are dead. Game ended. The villagers win 🏆🏆🏆🏆🏆🏆."
            )
            return True

        return False

    def add_emojis(self, content):
        return content.replace('villager 🧑‍🌾', 'villager').replace('villager', 'villager 🧑‍🌾'
                     ).replace('werewolf 🐺', 'werewolf').replace('werewolf', 'werewolf 🐺'
                     ).replace('werewolves 🐺', 'werewolves').replace('werewolves', 'werewolves 🐺'
                     ).replace('seer 🔮', 'seer').replace('seer', 'seer 🔮'
                     ).replace('witch 🧙‍♀️', 'witch').replace('witch', 'witch 🧙‍♀️'
                     ).replace('hunter 🕵🏿‍♂️', 'hunter').replace('hunter', 'hunter 🕵🏿‍♂️'
                     ).replace('police 👮', 'police').replace('police', 'police 👮')

    async def speak(self, speaker, visibility, content):
        self.speaker_records.append(
            {
                "day": self.current_day,
                "speaker": speaker,
                "visibility": visibility,
                "content": self.add_emojis(content),
            }
        )
        if type(speaker) is int:
            speaker_str = "Player " + str(speaker + 1) + ' (' + self.roles[speaker] + ')'
        else:
            speaker_str = speaker
        print(
            PrintColors.RED
            + ("Night " if self.is_night else "Day ")
            + str(self.current_day) + ", " + speaker_str + ": "
            + PrintColors.END
            + content
        )

        # send chat record immediately to the user to make responses faster
        for player in self.interactive_players:
            await self.send_chat_record(player, self.generate_history_messages(player))

    async def werewolves_kill(self):
        votes = [0 for i in range(0, self.num_players)]
        alive_werewolves = []
        for i in range(0, self.num_players):
            if self.roles[i] == "werewolf" and self.alive[i]:
                alive_werewolves.append(i)

        list_werewolves = str([i + 1 for i in alive_werewolves])
        for i in alive_werewolves:
            to_kill = await self.input_living_player(
                i,
                "The list of living werewolves is "
                + list_werewolves
                + ". Please pick one living player to kill. Typically werewolves first kill the seer, then the witch, and then the hunter and villagers.",
            )
            if type(to_kill) is int:
                votes[to_kill - 1] += 1
                await self.speak(
                    i,
                    "werewolf",
                    "Werewolf "
                    + str(i + 1)
                    + " wants to kill Player "
                    + str(to_kill)
                    + " at this night.",
                )

        highest_vote = 0
        for i in range(0, self.num_players):
            if votes[i] > votes[highest_vote]:
                highest_vote = i
        if votes[highest_vote] > 0:
            self.alive[highest_vote] = False
            self.dead_players_in_this_round.append(highest_vote)
            await self.speak(
                "Moderator",
                "werewolf",
                "Werewolves kill player " + str(highest_vote + 1) + " at this night.",
            )

    async def seers_reveal_identity(self):
        for i in range(0, self.num_players):
            if self.roles[i] == "seer" and self.alive[i]:
                player = await self.input_any_player(
                    i, "You are the seer and can reveal the real role of any player."
                )
                if player:
                    await self.speak(
                        "Moderator",
                        "seer",
                        "You choose to reveal the role of player "
                        + str(player)
                        + ". The real role of player "
                        + str(player)
                        + " is "
                        + self.roles[player - 1]
                        + ".",
                    )

    async def witch_use_poison(self, witch):
        if self.witches_poison_used[witch]:
            return
        # if a witch is killed by the werewolves in this round, the witch still has a chance to use the poison
        if self.alive[witch] or (witch in self.dead_players_in_this_round):
            player = await self.input_living_player(
                witch,
                "You are the witch and you have a chance to kill any living player using the poison. You have only one chance to use the poison throughout the game. If you want to use the poison, output the player number to be killed. Otherwise, output None.",
            )
            if type(player) is int:
                self.alive[player - 1] = False
                self.dead_players_in_this_round.append(player - 1)
                self.witches_poison_used[witch] = True

    async def witch_use_antidote(self, witch):
        if self.witches_antidote_used[witch]:
            return
        if self.alive[witch]:
            response = await self.player_turn(
                witch,
                "Player "
                + str(self.dead_players_in_this_round[0] + 1)
                + " is just killed by the werewolves. You are the witch and have a chance to rescue the player killed by the werewolves. You have only one chance to use the antidote throughout the game. Do you want to rescue the player? Output Yes or No only, do not output any other words.",
            )
            if "yes" in response.lower():
                await self.speak(
                    "Moderator",
                    "none",
                    "Witch "
                    + str(witch + 1)
                    + " rescued the dead player "
                    + str(self.dead_players_in_this_round[0] + 1)
                    + ".",
                )
                self.alive[self.dead_players_in_this_round[0]] = True
                self.dead_players_in_this_round.clear()
                self.witches_antidote_used[witch] = True
        # if a witch is killed by the werewolves in this round, the witch has a chance to self-rescue
        elif witch in self.dead_players_in_this_round:
            response = await self.player_turn(
                witch,
                "You are just killed by the werewolves. You are the witch and have a chance to rescue yourself. You have only one chance to use the antidote throughout the game. Do you want to rescue yourself? Output Yes or No only, do not output any other words.",
            )
            if "yes" in response.lower():
                await self.speak(
                    "Moderator",
                    "none",
                    "Witch " + str(witch + 1) + " rescued him/herself.",
                )
                self.alive[witch] = True
                self.dead_players_in_this_round.clear()
                self.witches_antidote_used[witch] = True

    async def witches_use_poison_or_antidote(self):
        # use antidote
        if len(self.dead_players_in_this_round) > 0:
            for i in range(0, self.num_players):
                if self.roles[i] == "witch":
                    await self.witch_use_antidote(i)
        # use poison
        for i in range(0, self.num_players):
            if self.roles[i] == "witch":
                await self.witch_use_poison(i)

    async def hunter_kill_player(self, player):
        player = await self.input_living_player(
            player,
            "You are the hunter and you are just killed. You have the chance to kill one living player who is suspected to be werewolf. If you are not sure who is the werewolf, output None.",
        )
        if type(player) is int:
            self.alive[player - 1] = False
            self.dead_players_in_this_round.append(player - 1)
            await self.speak(
                "Moderator",
                "all",
                "Hunter kills player " + str(player) + " at this night.",
            )

    async def input_any_player(self, player, command):
        response = await self.player_turn(player, command + " Output the player number only, do not output any other words.")
        player = self.parse_int(response)
        if player is None:
            return None
        if player <= 0 or player > self.num_players:
            print(PrintColors.RED + "Invalid response: " + PrintColors.END + response)
            return None
        return player

    async def input_living_player(self, player, command):
        response = await self.player_turn(
            player,
            command
            + " The list of living players: "
            + self.list_living_players()
            + ". Output the player number only, do not output any other words.",
        )
        player = self.parse_int(response)
        if player is None:
            return None
        if player <= 0 or player > self.num_players:
            print(PrintColors.RED + "Invalid response: " + PrintColors.END + response)
            return None
        if not self.alive[player - 1]:
            print(PrintColors.RED + "Invalid response, player is not alive: " + PrintColors.END + response)
            return None
        return player

    async def transfer_police(self):
        player = await self.input_living_player(
            self.police,
            "You are the police and you are dead. Now you can transfer the police badge to another living player, or destroy the police badge. Make sure to transfer the police badge to a good folk. If you choose to destroy the police badge, output None."
        )
        if player:
            await self.speak(
                "Moderator",
                "all",
                "The original police, player "
                + str(self.police + 1)
                + ", is dead. He/she transfers the police badge to player "
                + str(player)
                + "."
            )
            self.police = player - 1
        else:
            await self.speak(
                "Moderator",
                "all",
                "The original police, player "
                + str(self.police + 1)
                + ", is dead. He/she destroys the police badge and there is no longer police."
            )
            self.police = None

    async def announce_deaths(self):
        if len(self.dead_players_in_this_round) == 0:
            await self.speak("Moderator", "all", "No one dead at this night.")
        else:
            list_dead = str([ player + 1 for player in self.dead_players_in_this_round])
            if len(self.dead_players_in_this_round) == 1:
                await self.speak("Moderator", "all", "Player " + list_dead + " is dead at this night.")
            else:
                await self.speak("Moderator", "all", "Players " + list_dead + " are dead at this night.")

        for player in self.dead_players_in_this_round:
            await self.say_last_word(player)
            if self.roles[player] == "hunter":
                await self.hunter_kill_player(player)
            if player == self.police:
                await self.transfer_police()

    async def say_last_word(self, player):
        response = await self.player_turn(
            player,
            "You are just killed. Please say some last word to all living players.",
        )
        await self.speak(player, "all", response)

    def iterate_living_players(self):
        first_to_speak = 0
        # police is the last to speak
        if self.police:
            first_to_speak = self.police + 1
        # if no police, start from the dead player in this round
        elif len(self.dead_players_in_this_round) > 0:
            first_to_speak = self.dead_players_in_this_round[0]

        living_players = []
        for i in range(first_to_speak, self.num_players):
            if self.alive[i]:
                living_players.append(i)
        for i in range(0, first_to_speak):
            if self.alive[i]:
                living_players.append(i)
        return living_players

    async def discuss_werewolves(self):
        for player in self.iterate_living_players():
            command = "It is your turn to discuss who are the werewolves according to the past conversions."
            if self.roles[player] == "werewolf":
                command += " Because you are a werewolf, please hide your identity and do not reveal that you are a werewolf. You may pretend to be another role."
            response = await self.player_turn(player, command)
            await self.speak(player, "all", response)

    async def vote_to_kill(self):
        votes = [0 for i in range(0, self.num_players)]
        for player in self.iterate_living_players():
            to_kill = await self.input_living_player(
                player, "Based on the discussion, please pick your suspected living werewolf."
            )
            if not to_kill:
                continue
            if player == self.police:
                votes[to_kill - 1] += 1.5
            else:
                votes[to_kill - 1] += 1
            await self.speak(
                player,
                "all",
                "Player "
                + str(player + 1)
                + " votes Player "
                + str(to_kill)
                + " as suspected werewolf.",
            )

        highest_vote = 0
        for i in range(0, self.num_players):
            if votes[i] > votes[highest_vote]:
                highest_vote = i
        if votes[highest_vote] > 0:
            self.alive[highest_vote] = False
            self.dead_players_in_this_round.append(highest_vote)
            await self.speak(
                "Moderator",
                "all",
                "Player "
                + str(highest_vote + 1)
                + " is eliminated due to receiving the highest vote as suspected werewolf at this day.",
            )

    async def vote_for_police(self, nominate_police_players):
        votes = [0 for i in range(0, self.num_players)]
        for player in self.iterate_living_players():
            response = await self.player_turn(
                player,
                "Please vote for the police according to the election speech above. The list of players who nominate to the police: "
                + str([ i+1 for i in nominate_police_players ])
                + ". Output the player number only, do not output any other words.",
            )
            vote = self.parse_int(response)
            if vote is None:
                continue
            if (vote - 1) not in nominate_police_players:
                continue
            votes[vote - 1] += 1
            await self.speak(
                player,
                "all",
                "Player "
                + str(player + 1)
                + " votes Player "
                + str(vote)
                + " as police.",
            )

        highest_vote = 0
        for i in range(0, self.num_players):
            if votes[i] > votes[highest_vote]:
                highest_vote = i
        if votes[highest_vote] > 0:
            self.police = highest_vote
        else:
            self.police = nominate_police_players[0]
        await self.speak(
            "Moderator",
            "all",
            "Player "
            + str(self.police + 1)
            + " is elected as the police.",
        )

    async def elect_police(self):
        for player in self.iterate_living_players():
            response = await self.player_turn(
                player,
                "It is your turn to nominate to the police. Police has 1.5 votes and is the last to speak during discussion in the day. Typically the seer should be the police. If the seer is dead, the police should typically be another good folk. You may self-nominate to the police or nominate another player as the police."
            )
            await self.speak(player, "all", response)

        nominate_police_players = []
        for player in self.iterate_living_players():
            response = await self.player_turn(
                player,
                "Do you want to nominate yourself for the police? Answer Yes or No, do not output any other words."
            )
            if "yes" in response.lower():
                nominate_police_players.append(player)
                await self.speak("Moderator", "all", "Player " + str(player + 1) + " self-nominates to the police.")

        if len(nominate_police_players) > 0:
            await self.vote_for_police(nominate_police_players)
        else:
            await self.speak("Moderator", "all", "No one self-nominate to the police.")

    def initialize_round(self):
        self.dead_players_in_this_round.clear()
        self.current_day += 1
        self.is_night = True

        print(PrintColors.RED + 'Living players: ' + self.list_living_players() + PrintColors.END)
        print(PrintColors.RED + 'Roles: ' + str([ self.roles[i] for i in range(0, self.num_players) if self.alive[i] ]) + PrintColors.END)

    async def tell_roles_to_players(self):
        for player in range(0, self.num_players):
            await self.speak("Moderator", player, "You are Player " + str(player + 1) + ", your role is " + self.roles[player] + ".")

    async def run_game(self):
        # first day
        self.initialize_round()
        self.is_night = False
        await self.tell_roles_to_players()
        await self.elect_police()
        await self.discuss_werewolves()
        await self.vote_to_kill()
        if await self.game_ended():
            return

        while True:
            self.initialize_round()

            # at night
            # werewolves choose the player to kill
            await self.werewolves_kill()
            # seers select the player to reveal identity
            await self.seers_reveal_identity()
            # witches choose to use poison or antidote
            await self.witches_use_poison_or_antidote()
            if await self.game_ended():
                return

            # at day
            self.is_night = False
            await self.announce_deaths()
            # everyone discuss who are the werewolves
            await self.discuss_werewolves()
            # vote the player to kill
            await self.vote_to_kill()
            if await self.game_ended():
                return


if __name__ == "__main__":
    game = Mafia()
    game.run_game()
