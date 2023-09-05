import enum
import pydantic
from typing import List, Dict, Tuple


class ChatEventType(str, enum.Enum):
    agent_chat = "agent_chat"


class PersonaChatEvent(pydantic.BaseModel):
    event_id: str
    agent_name: str
    event_type: ChatEventType
    target_agent_name: str
    messages: List[Dict[str, str]]  # should be in ChatGPT conversation format


class EventResult(pydantic.BaseModel):
    event_id: str
    result: str


class AgentChatInput(pydantic.BaseModel):
    agent_name: str
    user_id: str
    conversations: List[Dict[str, str]]  # should be in ChatGPT conversation format


class AgentChatRecord(pydantic.BaseModel):
    agent_name: str
    conversations: list


class AgentProfile(pydantic.BaseModel):
    agent_name: str
    avatar_url: str
    greetings: str
    profile: str


class GameProfile(pydantic.BaseModel):
    user_id: str
    num_players: int
    player_names: list
    moderator: str
    interactive_players: list
    personas: list


class PersonaProfile(pydantic.BaseModel):
    persona: str


class PrintColors:
    RED = "\033[1;31m"
    PURPLE = "\033[1;35m"
    CYAN = "\033[1;36m"
    END = '\033[0m'


class PathfinderRequest(pydantic.BaseModel):
    # x, y coordinates of start and end
    start: Tuple[int, int]
    end: Tuple[int, int]


class PathfinderResponse(pydantic.BaseModel):
    path: List[Tuple[int, int]]
