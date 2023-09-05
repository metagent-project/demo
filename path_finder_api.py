from path_finder import path_finder
from maze import Maze

collision_block_id = "32125"


def find_path(start, end, verbose=False):
    maze = Maze("the_ville")
    return path_finder(maze.collision_maze, start, end, collision_block_id, verbose=verbose)
