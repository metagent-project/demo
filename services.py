import asyncio
import io
import json

from PIL import Image

from fastapi import Request
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import uuid

from run import app
from typedefs import *
from chatgpt import ChatGPT

templates = Jinja2Templates(directory="templates")

chat_event_queue = asyncio.Queue()
records = {}  # user_id -> agent_name -> AgentChatRecord
agent_event_queues = {}  # user_id -> PersonaChatEvent
personas = {}  # user_id -> agent_name -> PersonaProfile
running_games = {}  # user_id -> game_instance
chat_stream_inputs = {}  # chat_id (str) -> AgentChatInput


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("home.html", {"request": request})


@app.get("/home", response_class=HTMLResponse)
async def home(request: Request, user_id: str):
    return templates.TemplateResponse(
        "main.html", {"request": request, "user_id": user_id}
    )


@app.get("/game", response_class=HTMLResponse)
async def game_page(request: Request):
    return templates.TemplateResponse("base.html", {"request": request})


@app.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request):
    return templates.TemplateResponse("chat.html", {"request": request})


# async def event_generator():
#     while True:
#         print(id(chat_event_queue))
#         #persona = await chat_event_queue.get()
#         asyncio.sleep(1)
#         yield {"name": "persona"}


@app.post("/api/init_game")
async def init_game(game_profile: GameProfile):
    if game_profile.user_id in running_games:
        running_games[game_profile.user_id].stop_game()
        del running_games[game_profile.user_id]

    if game_profile.user_id in personas:
        game_profile.personas = personas[game_profile.user_id]
    running_games[game_profile.user_id] = mafia.Mafia(game_profile)

    return {"status": "ok"}


@app.get("/api/agent_avatar")
async def agent_avatar(agent_name: str):
    agent_name = agent_name.replace(" ", "_")
    img = Image.open(f"static/assets/characters/{agent_name}.png")
    avatar = img.crop((32, 0, 32 + 32, 32))
    with io.BytesIO() as output:
        avatar.save(output, format="PNG")
        contents = output.getvalue()
        return Response(content=contents, media_type="image/png")


@app.get("/api/agent_profile")
async def agent_profile(agent_name: str):
    with open(f"personas/{agent_name}/bootstrap_memory/scratch.json") as f:
        scratch = json.load(f)
        profile = scratch["learned"] + "\n" + scratch["currently"]
    if agent_name == "Abigail Chen":
        greetings = "Hello, I'm Abigail Chen. Welcome to the exciting AI ville, a world where human and AI integration comes alive. I'm your tour guide for this incredible interactive game with user and AI agents interaction."
    elif agent_name == "Adam Smith":
        greetings = "Hello, I'm Adam Smith. I'm the moderator of the game! I'm gathering AI Agents to the center of this ville."
    else:
        greetings = f"Hello, I'm {agent_name}"
    return AgentProfile(
        agent_name=agent_name,
        avatar_url=f"/api/agent_avatar?agent_name={agent_name}",
        greetings=greetings,
        profile=profile,
    )


# persona: user_id; agent_id


###############################
# Persona Chat Event
###############################
# 1. Agent A send chat event to user (frontend) about what it is going to chat with Agent B
# 2. User (frontend) send this message to Agent B [w/ all previous conversations]
# 3. Agent B replies user (frontend) with the reply/result
# 4. User (frontend) send the reply/result to Agent A [w/ only the result]


@app.post("/api/send_chat_event")
async def send_chat_event(user_id: str, event: PersonaChatEvent):
    """
    Agent send chat event to user (frontend) about what it is going to chat with Agent B.
    """
    if user_id not in agent_event_queues:
        agent_event_queues[user_id] = asyncio.Queue()
    q = agent_event_queues[user_id]
    if event.event_type == ChatEventType.agent_chat:
        await q.put(event)
    else:
        raise NotImplementedError
    return {"status": "ok"}


@app.post("/api/pull_chat_event")
async def pull_chat_event(user_id) -> PersonaChatEvent:
    """
    User (frontend) pull chat event from agent.
    """
    if user_id not in agent_event_queues:
        agent_event_queues[user_id] = asyncio.Queue()
    q = agent_event_queues[user_id]
    event = await q.get()
    return event


@app.post("/api/reply_event_result")
async def reply_event_result(user_id: str, agent_name: str, result: EventResult):
    """
    User (frontend) send the reply/result (of Agent B) to Agent A [w/ only the result]
    """
    if user_id not in running_games:
        raise ValueError("user ID " + user_id + " does not exist")
    status = await running_games[user_id].agent_speak(agent_name, result.result)
    return {"status": status}


def save_chat_records(chat_input: AgentChatInput, reply: str):
    if chat_input.user_id not in records:
        records[chat_input.user_id] = {}

    chat_input.conversations.append({"role": "assistant", "content": reply})
    records.setdefault(chat_input.user_id, {})[
        chat_input.agent_name
    ] = chat_input.conversations


@app.post("/api/chat")
async def chat(chat_input: AgentChatInput):
    """
    Generate AI reply.
    This API is stateless. The frontend should pass in the past conversations.
    """
    # reply = f"Hello, I'm {chat_input.agent_name}. You said '{chat_input.conversations[-1]['content']}'"
    reply = await ChatGPT().get_completion(chat_input.conversations)
    save_chat_records(chat_input, reply)
    return {"reply": reply}


async def stream_openai_response(chat_input: AgentChatInput):
    text_response = ''
    async with httpx.AsyncClient() as client:
        stream = ChatGPT().get_completion_stream(chat_input.conversations)
        async for chunk in stream:
            sse_response = ''
            text_response += chunk
            for line in chunk.split('\n'):
                sse_response += 'data: ' + line + "\n"
            yield sse_response + "\n"
    save_chat_records(chat_input, text_response)


@app.post("/api/chat_stream_post_input")
async def chat_stream_post_input(chat_input: AgentChatInput):
    while True:
        random_id = str(uuid.uuid4())
        if random_id not in chat_stream_inputs:
            break
    chat_stream_inputs[random_id] = chat_input
    return {"chat_id": random_id}


@app.get("/api/chat_stream_pull_response")
async def chat_stream_pull_response(chat_id: str):
    if chat_id not in chat_stream_inputs:
        return {"status": "error"}
    chat_input = chat_stream_inputs[chat_id]
    del chat_stream_inputs[chat_id]
    return StreamingResponse(stream_openai_response(chat_input), media_type="text/event-stream")


@app.post("/api/get_chat")
async def get_chat(user_id: str, agent_name: str):
    conversations = records.get(user_id, {}).get(agent_name, [])
    return AgentChatRecord(
        agent_name=agent_name,
        conversations=conversations,
    )


@app.post("/api/update_persona")
async def update_persona(user_id: str, agent_name: str, persona: PersonaProfile):
    if user_id not in personas:
        personas[user_id] = {}
    if agent_name not in personas[user_id]:
        personas[user_id][agent_name] = {}
    personas[user_id][agent_name] = persona
    if user_id in running_games:
        running_games[user_id].update_player_personas(agent_name, persona)
    return {"status": "ok"}


@app.post("/api/find_path")
async def find_path(location: PathfinderRequest):
    """Find the path from start to end.

    Example:
    {
        "start": [
            56,16
        ],
        "end": [
            96, 65
        ]
    }
    """
    from path_finder_api import find_path

    path = find_path(location.start, location.end)
    return PathfinderResponse(path=path)


# import mafia at last due to circular import
import mafia
