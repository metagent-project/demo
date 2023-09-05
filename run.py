import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

import services

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("run:app", host="localhost", port=8000, reload=True)
