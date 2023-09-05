/*
  Main resources: 
  https://www.youtube.com/watch?v=cKIG1lKwLeo&t=401s&ab_channel=HongLy
  For the ground zero code, see the exported files from here: 
  https://codepen.io/mikewesthad/pen/BVeoYP?editors=1111 
 
  Also worth taking a look: 
  https://www.youtube.com/watch?v=fdXcD9X4NrQ&ab_channel=MorganPage
  and 
  https://www.youtube.com/watch?v=MR2CvWxOEsw&ab_channel=MattWilber
 */


// ###########################################################################
// PREAMBLE
// ###########################################################################

const chatWindow = parent.document.getElementById("chat-frame").contentWindow;

// <step> -- one full loop around all three phases determined by <phase> is 
// a step. We use this to link the steps in the backend. 
let step = parseInt(document.getElementById('step').innerHTML);
let sim_code = document.getElementById('sim_code').innerHTML;
// let persona_names = document.getElementById('persona_name_list').innerHTML.split(",");

let spans = document.getElementById('persona_init_pos').getElementsByTagName('span');
let persona_names = {};
let persona_target_pos = {};
for (var i = 0, l = spans.length; i < l; i++) {
    let x = spans[i].innerText.split(",");
    persona_names[x[0]] = [parseInt(x[1]), parseInt(x[2])]
    persona_target_pos[x[0]] = [parseInt(x[3]), parseInt(x[4])]
}

const player_init_pos_str = document.getElementById('player_init_pos').innerHTML;
const player_init_pos = player_init_pos_str.split(",").map(x => parseInt(x));
const tour_guide_name = document.getElementById('tour_guide_name').innerHTML;

// Get the group game moderator.
const group_game_moderator_name = document.getElementById('group_game_moderator_name').innerHTML;
// Add the personas that will join the group game.
let group_game_persona_names = [];
let group_game_persona_spans = document.getElementById('group_game_persona_names').getElementsByTagName('span');
for (let name_span of group_game_persona_spans) {
    group_game_persona_names.push(name_span.innerText);
}

// Phaser 3.0 global settings. 
// Configuration meant to be passed to the main Phaser game instance. 
const config = {
    type: Phaser.AUTO,
    // width: 1500,
    // height: 800,
    parent: "game-container",
    pixelArt: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: 'game-container', // The id of the DOM element that contains the game canvas
        width: window.innerWidth,
        height: window.innerHeight,
    },
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 0 }
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// const config = {
//   type: Phaser.AUTO,
//   width: 4480,
//   height: 3200,
//   parent: "game-container",
//   pixelArt: true,
//   physics: {
//     default: "arcade",
//     arcade: {
//       gravity: { y: 0 } } },
//   scene: {
//     preload: preload,
//     create: create,
//     update: update },
//   scale: {zoom: 0.5} };

// Creating the game instance and setting up the main Phaser variables that  
// will be used in it. 
const game = new Phaser.Game(config);

let cursors;
let camera;
let player;
let showDebug = false;

// Persona related variables. This should have the name of the persona as its 
// keys, and the instances of the Persona class as the values.
var spawn_tile_loc = {};
// for (var i = 0; i < persona_names.length; i++) { 
// 	spawn_tile_loc[persona_names[i]] = [0, 0]
// }

for (var key in persona_names) {
    spawn_tile_loc[key] = persona_names[key];
}
console.log(spawn_tile_loc);

var personas = {};
var pronunciatios = {};
let anims_direction;
let pre_anims_direction;
let pre_anims_direction_dict = {};

let curr_maze = "the_ville";

// <tile_width> is the width of one individual tile (tiles are square)
let tile_width = 32;
// Important: tile_width % movement_speed has to be 0. 
// <movement_speed> determines how fast we move at each upate cylce. 
let movement_speed = 32;

// Define min and max zoom levels
let minZoom = 0.25;
let maxZoom = 3;

// <timer_max> determines how frequently our update function will query the 
// frontend server. If it's higher, we wait longer cycles. 
let timer_max = 0;
let timer = timer_max;

// <phase> -- there are three phases: "process," "update," and "execute."
let phase = "null"; // or "update" or "execute"

// Variables for storing movements that are sent from the backend server.
let execute_movement;
let execute_count_max = tile_width / movement_speed;
let execute_count = execute_count_max;
let movement_target = {};

let collisionText;
let positionText;

// A signal of starting moving personas.
let startMovePersonasFlag = false;
let personasOnTheMove = new Set();

const sprite_names = [
    "Abigail_Chen",
    "Adam_Smith",
    "Arthur_Burton",
    "Ayesha_Khan",
    "Carlos_Gomez",
    "Carmen_Ortiz",
    "Eddy_Lin",
    "Francisco_Lopez",
    "Giorgio_Rossi",
    "Hailey_Johnson",
    "Isabella_Rodriguez",
    "Jane_Moreno",
    "Jennifer_Moore",
    "John_Lin",
    "Klaus_Mueller",
    "Latoya_Williams",
    "Maria_Lopez",
    "Mei_Lin",
    "Rajiv_Patel",
    "Ryan_Park",
    "Sam_Moore",
    "Tamara_Taylor",
    "Tom_Moreno",
    "Wolfgang_Schulz",
    "Yuriko_Yamamoto",
];


// ###########################################################################
// ENGINE
// ###########################################################################

// Joon: Phaser 3.0 is oriented around "scenes" -- recall how Pokemon plays: 
//       there is the outdoor space, and then there is the indoor space; when
//       you go inside, you transition to a new "scene" and the outdoor space
//       basically disappears. 
//       A scene in Phaser has four key methods that are called at different
//       stages of rendering for different purposes. They are: 
//       init() -> preload() -> create() -> update()
//         init() is called only once at the very beginning. This is the 
//           initialization function in case that is needed. 
//         preload() is called once and preloads any of the assets
//         create() is also called once after preloading... creates sprites 
//           and actually displays stuff
//         update() is called on each frame during the game play 

function preload() {
    // Loading the necessary images (e.g., the background image, character 
    // sprites). 

    // Joon: for load.image, the first parameter is simply the key value that
    //       you are passing in. The second parameter should be pointed to the
    //       png file that contains the tileset. 
    //       Also IMPORTANT: when you create a tileset in Tiled, always be  
    //       sure to check the "embedded" option. 
    this.load.image("blocks_1", "/static/assets/the_ville/visuals/map_assets/blocks/blocks_1.png");
    this.load.image("walls", "/static/assets/the_ville/visuals/map_assets/v1/Room_Builder_32x32.png");
    this.load.image("interiors_pt1", "/static/assets/the_ville/visuals/map_assets/v1/interiors_pt1.png");
    this.load.image("interiors_pt2", "/static/assets/the_ville/visuals/map_assets/v1/interiors_pt2.png");
    this.load.image("interiors_pt3", "/static/assets/the_ville/visuals/map_assets/v1/interiors_pt3.png");
    this.load.image("interiors_pt4", "/static/assets/the_ville/visuals/map_assets/v1/interiors_pt4.png");
    this.load.image("interiors_pt5", "/static/assets/the_ville/visuals/map_assets/v1/interiors_pt5.png");
    this.load.image("CuteRPG_Field_B", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Field_B.png");
    this.load.image("CuteRPG_Field_C", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Field_C.png");
    this.load.image("CuteRPG_Harbor_C", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Harbor_C.png");
    this.load.image("CuteRPG_Village_B", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Village_B.png");
    this.load.image("CuteRPG_Forest_B", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Forest_B.png");
    this.load.image("CuteRPG_Desert_C", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Desert_C.png");
    this.load.image("CuteRPG_Mountains_B", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Mountains_B.png");
    this.load.image("CuteRPG_Desert_B", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Desert_B.png");
    this.load.image("CuteRPG_Forest_C", "/static/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Forest_C.png");

    // Joon: This is the export json file you get from Tiled. 
    this.load.tilemapTiledJSON("map", "/static/assets/the_ville/visuals/the_ville_jan7.json");

    // An atlas is a way to pack multiple images together into one texture. I'm 
    // using it to load all the player animations (walking left, walking right, 
    // etc.) in one image. For more info see:
    // https://labs.phaser.io/view.html?src=src/animation/texture%20atlas%20animation.js
    // If you don't use an atlas, you can do the same thing with a spritesheet, 
    // see: https://labs.phaser.io/view.html?src=src/animation/single%20sprite%20sheet.js
    // Joon: Technically, I think this guy had the best tutorial for atlas: 
    //       https://www.youtube.com/watch?v=fdXcD9X4NrQ&ab_channel=MorganPage
    this.load.atlas("atlas",
        "https://mikewesthad.github.io/phaser-3-tilemap-blog-posts/post-1/assets/atlas/atlas.png",
        "https://mikewesthad.github.io/phaser-3-tilemap-blog-posts/post-1/assets/atlas/atlas.json");

    sprite_names.forEach(name => {
        this.load.atlas(name.replace("_", " "),
            "/static/assets/characters/" + name + ".png",
            "/static/assets/characters/atlas.json");
    });
}

function create() {
    const map = this.make.tilemap({ key: "map" });
    // Joon: Logging map is really helpful for debugging here: 
    //       console.log(map);

    // The first parameter is the name you gave to the tileset in Tiled and then
    // the key of the tileset image in Phaser's cache (i.e. the name you used in
    // preload)
    // Joon: for the first parameter here, really take a look at the 
    //       console.log(map) output. You need to make sure that the name 
    //       matches.
    const collisions = map.addTilesetImage("blocks", "blocks_1");
    const walls = map.addTilesetImage("Room_Builder_32x32", "walls");
    const interiors_pt1 = map.addTilesetImage("interiors_pt1", "interiors_pt1");
    const interiors_pt2 = map.addTilesetImage("interiors_pt2", "interiors_pt2");
    const interiors_pt3 = map.addTilesetImage("interiors_pt3", "interiors_pt3");
    const interiors_pt4 = map.addTilesetImage("interiors_pt4", "interiors_pt4");
    const interiors_pt5 = map.addTilesetImage("interiors_pt5", "interiors_pt5");
    const CuteRPG_Field_B = map.addTilesetImage("CuteRPG_Field_B", "CuteRPG_Field_B");
    const CuteRPG_Field_C = map.addTilesetImage("CuteRPG_Field_C", "CuteRPG_Field_C");
    const CuteRPG_Harbor_C = map.addTilesetImage("CuteRPG_Harbor_C", "CuteRPG_Harbor_C");
    const CuteRPG_Village_B = map.addTilesetImage("CuteRPG_Village_B", "CuteRPG_Village_B");
    const CuteRPG_Forest_B = map.addTilesetImage("CuteRPG_Forest_B", "CuteRPG_Forest_B");
    const CuteRPG_Desert_C = map.addTilesetImage("CuteRPG_Desert_C", "CuteRPG_Desert_C");
    const CuteRPG_Mountains_B = map.addTilesetImage("CuteRPG_Mountains_B", "CuteRPG_Mountains_B");
    const CuteRPG_Desert_B = map.addTilesetImage("CuteRPG_Desert_B", "CuteRPG_Desert_B");
    const CuteRPG_Forest_C = map.addTilesetImage("CuteRPG_Forest_C", "CuteRPG_Forest_C");

    // The first parameter is the layer name (or index) taken from Tiled, the 
    // second parameter is the tileset you set above, and the final two 
    // parameters are the x, y coordinate. 
    // Joon: The "layer name" that comes as the first parameter value  
    //       literally is taken from our Tiled layer name. So to find out what
    //       they are; you actually need to open up tiled and see how you 
    //       named things there. 
    let tileset_group_1 = [CuteRPG_Field_B, CuteRPG_Field_C, CuteRPG_Harbor_C, CuteRPG_Village_B,
        CuteRPG_Forest_B, CuteRPG_Desert_C, CuteRPG_Mountains_B, CuteRPG_Desert_B, CuteRPG_Forest_C,
        interiors_pt1, interiors_pt2, interiors_pt3, interiors_pt4, interiors_pt5, walls];
    const bottomGroundLayer = map.createLayer("Bottom Ground", tileset_group_1, 0, 0);
    const exteriorGroundLayer = map.createLayer("Exterior Ground", tileset_group_1, 0, 0);
    const exteriorDecorationL1Layer = map.createLayer("Exterior Decoration L1", tileset_group_1, 0, 0);
    const exteriorDecorationL2Layer = map.createLayer("Exterior Decoration L2", tileset_group_1, 0, 0);
    const interiorGroundLayer = map.createLayer("Interior Ground", tileset_group_1, 0, 0);
    const wallLayer = map.createLayer("Wall", [CuteRPG_Field_C, walls], 0, 0);
    const interiorFurnitureL1Layer = map.createLayer("Interior Furniture L1", tileset_group_1, 0, 0);
    const interiorFurnitureL2Layer = map.createLayer("Interior Furniture L2 ", tileset_group_1, 0, 0);
    const foregroundL1Layer = map.createLayer("Foreground L1", tileset_group_1, 0, 0);
    const foregroundL2Layer = map.createLayer("Foreground L2", tileset_group_1, 0, 0);
    foregroundL1Layer.setDepth(2);
    foregroundL2Layer.setDepth(2);

    const collisionsLayer = map.createLayer("Collisions", collisions, 0, 0);

    for (let y = 0; y < collisionsLayer.layer.data.length; y++) {
        for (let x = 0; x < collisionsLayer.layer.data[y].length; x++) {
            let tile = collisionsLayer.layer.data[y][x];
            if (tile.index === -1) {
                continue;
            }
            tile.properties.collide = true;
            // For fine-grined collision control:
            // for (let property of ["collideUp", "collideRight", "collideDown", "collideLeft"]) {
            //     tile[property] = true;
            // }
        }
    }
    // const groundLayer = map.createLayer("Ground", walls, 0, 0);
    // const indoorGroundLayer = map.createLayer("Indoor Ground", walls, 0, 0);
    // const wallsLayer = map.createLayer("Walls", walls, 0, 0);
    // const interiorsLayer = map.createLayer("Furnitures", interiors, 0, 0);
    // const builtInLayer = map.createLayer("Built-ins", interiors, 0, 0);
    // const appliancesLayer = map.createLayer("Appliances", interiors, 0, 0);
    // const foregroundLayer = map.createLayer("Foreground", interiors, 0, 0);

    // Joon : This is where you want to create a custom field for the tileset
    //        in Tiled. Take a look at this guy's tutorial: 
    //        https://www.youtube.com/watch?v=MR2CvWxOEsw&ab_channel=MattWilber
    collisionsLayer.setCollisionByProperty({ collide: true });
    // By default, everything gets depth sorted on the screen in the order we 
    // created things. Here, we want the "Above Player" layer to sit on top of 
    // the player, so we explicitly give it a depth. Higher depths will sit on 
    // top of lower depth objects.
    // Collisions layer should get a negative depth since we do not want to see
    // it. 
    collisionsLayer.setDepth(-1);
    // foregroundL1Layer.setDepth(2);
    // foregroundL1Layer.setDepth(2);

    // *** SET UP CAMERA *** 
    // "player" is to be set as the center of mass for our "camera." We 
    // basically create a game character sprite as we would for our personas 
    // but we move it to depth -1 and let it pass through the collision map;  
    // that is, do not have the following line: 
    // this.physics.add.collider(player, collisionsLayer);
    // OLD NOTE: Create a sprite with physics enabled via the physics system. 
    // The image  used for the sprite has a bit of whitespace, so I'm using 
    // setSize & setOffset to control the size of the player's body.

    const player_start_pos = [player_init_pos[0] * tile_width + tile_width / 2, player_init_pos[1] * tile_width];
    player = this.physics.add.
        sprite(player_start_pos[0], player_start_pos[1], "atlas", "misa-front").
        setSize(30, 40 - 10).
        setOffset(0, 32);
    // player.setDepth(-1);
    this.physics.add.collider(player, collisionsLayer);

    // Setting up the camera. 
    camera = this.cameras.main;
    camera.startFollow(player);
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cursors = this.input.keyboard.createCursorKeys();

    // Zooming
    // Define keys for zooming in and out
    zoomInKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    zoomOutKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    camera.setZoom(1)

    // Debug graphics
    this.input.keyboard.once("keydown-D", event => {
        // Turn on physics debugging to show player's hitbox
        this.physics.world.createDebugGraphic();

        // Create worldLayer collision graphic above the player, but below the help text
        const graphics = this.add
            .graphics()
            .setAlpha(0.75)
            .setDepth(20);
        collisionsLayer.renderDebug(graphics, {
            tileColor: null, // Color of non-colliding tiles
            collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255), // Color of colliding tiles
            faceColor: new Phaser.Display.Color(40, 39, 37, 255) // Color of colliding face edges
        });

        positionText.setVisible(true);
        showDebug = true;
    });

    // *** SET UP PERSONAS *** 
    // We start by creating the game sprite objects. 
    for (let i = 0; i < Object.keys(spawn_tile_loc).length; i++) {
        let persona_name = Object.keys(spawn_tile_loc)[i];
        let start_pos = [spawn_tile_loc[persona_name][0] * tile_width + tile_width / 2, spawn_tile_loc[persona_name][1] * tile_width + tile_width];
        let new_sprite = this.physics.add
            .sprite(start_pos[0], start_pos[1], persona_name, "down")
            .setSize(30, 40 - 10)
            //.setOffset(0, 32)  // DEBUG 1 --- I added 32 offset on Dec 29. 
            .setImmovable(true);
        new_sprite.name = persona_name;

        // Here, we are creating the persona and its pronunciatio sprites.
        personas[persona_name] = new_sprite;
        pronunciatios[persona_name] = this.add.text(
            new_sprite.body.x - 6,
            new_sprite.body.y - 42 - 16, // DEBUG 1 --- I added 32 offset on Dec 29. 
            "🦁", {
            font: "24px monospace",
            fill: "#000000",
            padding: { x: 8, y: 8 },
            backgroundColor: "#ffffff",
            border: "solid",
            borderRadius: "10px"
        }).setDepth(3).setVisible(false);
    }

    // Create the text
    collisionText = this.add.text(0, 0, 'Collision!', {
        font: "28px monospace",
        fill: "#000000",
        padding: { x: 8, y: 8 },
        backgroundColor: "#ffffff",
        border: "solid",
        borderRadius: "10px"
    }).setDepth(3);
    collisionText.setVisible(false);  // Hide it initially
    player.setData('collidingWith', new Set());

    // Create the position text for debugging
    positionText = this.add.text(0, 0, 'Position: ', {
        font: "18px monospace",
        fill: "#000000",
        padding: { x: 8, y: 8 },
        backgroundColor: "#ffffff",
        border: "solid",
        borderRadius: "10px"
    }).setDepth(3);
    positionText.setVisible(false);  // Hide it initially

    // *** INITIALIZE AGENTS ***
    for (let name of group_game_persona_names) {
        chatWindow.initAgent(name);
    }
    chatWindow.initAgent(group_game_moderator_name);

    // *** SET UP COLLISIONS ***
    Object.values(personas).forEach(sprite => {
        this.physics.add.collider(player, sprite, function (player, sprite) {
            // prevent interaction if the sprite is moving
            if (personasOnTheMove.has(sprite.name)) return;
            let collidingWith = player.getData('collidingWith');
            if (!collidingWith.has(sprite.name)) {
                console.log('collision with', collidingWith, sprite.name);
                collidingWith.add(sprite.name);
                chatWindow.selectAgent(sprite.name);
                // collisionText.setPosition(sprite.x, sprite.y - 50);
                // collisionText.setVisible(true);
            }
        }, null, this);
    });

    // Create the player's walking animations from the texture atlas. These are
    // stored in the global animation manager so any sprite can access them.
    const anims = this.anims;
    const atlas_anim_keys = ["misa-left-walk", "misa-right-walk", "misa-front-walk", "misa-back-walk"];
    atlas_anim_keys.forEach(key => {
        anims.create({
            key: key,
            frames: anims.generateFrameNames("atlas", { prefix: key + ".", start: 0, end: 3, zeroPad: 3 }),
            frameRate: 4,
            repeat: -1
        });
    });
    const other_anim_keys = ["left-walk", "right-walk", "down-walk", "up-walk"];
    other_anim_keys.forEach(key => {
        sprite_names.forEach(name => {
            anims.create({
                key: name.replace("_", " ") + "_" + key,  // key of the animation
                frames: anims.generateFrameNames(name.replace("_", " "), { prefix: key + ".", start: 0, end: 3, zeroPad: 3 }),
                frameRate: 4,
                repeat: -1
            });
        });
    });
}

function startMovePersonas() {
    startMovePersonasFlag = true;
}

function chainTween(this_game, sprite, path, index) {
    const curr_persona_name = sprite.name;

    if (index === path.length) {
        console.log(`tween complete for ${sprite.name}`);
        sprite.anims.stop();
        sprite.setTexture(curr_persona_name, "down")
        personasOnTheMove.delete(curr_persona_name);
        return;
    }
    let next_x = path[index][0] * tile_width + tile_width / 2;
    let next_y = path[index][1] * tile_width + tile_width / 2;

    // NOTE: sprite.body.x is different from x; the former is the position of left top corner of the sprite,
    // and represents the physics body, the change may be overridden by the physics engine in the next update if there are forces,
    // velocity, or collisions acting on the sprite;
    // while the latter is the position of the center of the sprite.

    if (sprite.x < next_x) {
        anims_direction = "r";
        pre_anims_direction_dict[curr_persona_name] = "r"
    } else if (sprite.x > next_x) {
        anims_direction = "l";
        pre_anims_direction_dict[curr_persona_name] = "l"
    } else if (sprite.y < next_y) {
        anims_direction = "d";
        pre_anims_direction_dict[curr_persona_name] = "d"
    } else if (sprite.y > next_y) {
        anims_direction = "u";
        pre_anims_direction_dict[curr_persona_name] = "u"
    } else {
        anims_direction = "";
    }
    if (anims_direction == "l") {
        sprite.anims.play(curr_persona_name + "_" + "left-walk", true);
    } else if (anims_direction == "r") {
        sprite.anims.play(curr_persona_name + "_" + "right-walk", true);
    } else if (anims_direction == "u") {
        sprite.anims.play(curr_persona_name + "_" + "up-walk", true);
    } else if (anims_direction == "d") {
        sprite.anims.play(curr_persona_name + "_" + "down-walk", true);
    } else {
        sprite.anims.stop();

        // If we were moving, pick an idle frame to use
        if (pre_anims_direction_dict[curr_persona_name] == "l") sprite.setTexture(curr_persona_name, "left"); else
            if (pre_anims_direction_dict[curr_persona_name] == "r") sprite.setTexture(curr_persona_name, "right"); else
                if (pre_anims_direction_dict[curr_persona_name] == "u") sprite.setTexture(curr_persona_name, "up"); else
                    if (pre_anims_direction_dict[curr_persona_name] == "d") sprite.setTexture(curr_persona_name, "down");
    };

    let nextTween = this_game.add.tween({
        targets: sprite,
        x: { value: path[index][0] * tile_width + tile_width / 2, duration: 100 },
        y: { value: path[index][1] * tile_width + tile_width / 2, duration: 100 },
        ease: 'Linear',
        repeat: 0,
        onComplete: () => {
            chainTween(this_game, sprite, path, index + 1);
        }
    });
}


const movePersonas = async (this_game) => {
    onMovingPersonas = true;
    // This function initializes the movement of the persona.
    for (let name of Object.keys(persona_names)) {
        if (!group_game_persona_names.includes(name) && name != group_game_moderator_name) {
            // only gather personas that join the group game
            continue;
        }
        personasOnTheMove.add(name);
        let start_pos = persona_names[name];
        let end_pos = persona_target_pos[name];
        let find_path_response = await fetch(`/api/find_path`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                start: start_pos,
                end: end_pos,
            })
        });
        let path_found = await find_path_response.json();
        let path = path_found.path;
        chainTween(this_game, personas[name], path, 0);
    }
}


function update(time, delta) {
    // *** SETUP PLAY AND PAUSE BUTTON *** 
    // let play_context = this;
    // function game_resume() {
    //     play_context.scene.resume();
    // }
    // play_button.onclick = function () {
    //     game_resume();
    // };
    // function game_pause() {
    //     play_context.scene.pause();
    // }
    // pause_button.onclick = function () {
    //     game_pause();
    // };

    // *** MOVE CAMERA *** 
    // This is where we finish up the camera setting we started in the create() 
    // function. We set the movement speed of the camera and wire up the keys to
    // map to the actual movement.
    const camera_speed = 400;

    const prevVelocity = player.body.velocity.clone();

    // Stop any previous movement from the last frame
    player.body.setVelocity(0);

    // Horizontal movement
    if (cursors.left.isDown) {
        player.body.setVelocityX(-camera_speed);
    } else if (cursors.right.isDown) {
        player.body.setVelocityX(camera_speed);
    }

    // Vertical movement
    if (cursors.up.isDown) {
        player.body.setVelocityY(-camera_speed);
    } else if (cursors.down.isDown) {
        player.body.setVelocityY(camera_speed);
    }

    // Normalize and scale the velocity so that player can't move faster along a diagonal
    player.body.velocity.normalize().scale(camera_speed);

    // Update the animation last and give left/right animations precedence over up/down animations
    if (cursors.left.isDown) {
        player.anims.play("misa-left-walk", true);
    } else if (cursors.right.isDown) {
        player.anims.play("misa-right-walk", true);
    } else if (cursors.up.isDown) {
        player.anims.play("misa-back-walk", true);
    } else if (cursors.down.isDown) {
        player.anims.play("misa-front-walk", true);
    } else {
        player.anims.stop();

        // If we were moving, pick and idle frame to use
        if (prevVelocity.x < 0) player.setTexture("atlas", "misa-left");
        else if (prevVelocity.x > 0) player.setTexture("atlas", "misa-right");
        else if (prevVelocity.y < 0) player.setTexture("atlas", "misa-back");
        else if (prevVelocity.y > 0) player.setTexture("atlas", "misa-front");
    }

    // ** ZOOM CAMERA **

    // Check for zoom in key press
    if (zoomInKey.isDown) {
        let newZoom = camera.zoom + 0.01;
        camera.setZoom(Phaser.Math.Clamp(newZoom, minZoom, maxZoom));
    }

    // Check for zoom out key press
    if (zoomOutKey.isDown) {
        let newZoom = camera.zoom - 0.01;
        camera.setZoom(Phaser.Math.Clamp(newZoom, minZoom, maxZoom));
    }

    function _isClose(p1, p2) {
        return Math.abs(p1.x - p2.x) < tile_width * 1.5 && Math.abs(p1.y - p2.y) < tile_width * 1.5;
    }

    // handle colliding with personas
    let collidingWith = player.getData('collidingWith');
    Object.values(personas).forEach(sprite => {
        if (collidingWith.has(sprite.name) && !_isClose(player, sprite)) {
            collidingWith.delete(sprite.name);
        }
    });
    if (collidingWith.size === 0) {
        collisionText.setVisible(false);
    }

    if (showDebug) {
        positionText
            .setPosition(player.x, player.y - 50)
            .setText(`Position: ${(player.x / tile_width).toFixed(2)}, ${(player.y / tile_width).toFixed(2)}`);
    }

    if (startMovePersonasFlag) {
        movePersonas(this);
        startMovePersonasFlag = false;
    }

    if (phase == "null") { }
    // console.log("phase: " + phase + ", step: " + step);
    // *** MOVE PERSONAS ***
    // Moving personas take place in three distinct phases: "process," "update,"
    // and "execute." These phases are determined by the value of <phase>. 
    // Only one of the three phases is incurred in each update cycle. 
    else if (phase == "process") {
        // "process" takes all current locations of the personas and send them to
        // the frontend server in a json form. Here, we first create the json 
        // file that records all persona locations: 
        let data = {
            "step": step,
            "sim_code": sim_code,
            "environment": {}
        }
        for (let i = 0; i < Object.keys(personas).length; i++) {
            let persona_name = Object.keys(personas)[i];
            data["environment"][persona_name] = {
                "maze": curr_maze,
                "x": Math.ceil((personas[persona_name].body.position.x) / tile_width),
                "y": Math.ceil((personas[persona_name].body.position.y) / tile_width)
            }
        }
        var json = JSON.stringify(data);
        // We then send this to the frontend server: 
        var retrieve_xobj = new XMLHttpRequest();
        retrieve_xobj.overrideMimeType("application/json");
        retrieve_xobj.open('POST', "process_environment", true);
        retrieve_xobj.send(json);
        // Finally, we update the phase variable to start the "udpate" process. 
        // Now that we sent all persona locations to the backend server, we need
        // to wait until the backend determines what the personas will do next. 
        phase = "update";
    }

    else if (phase == "update") {
        // Update is where we * wait * for the backend server to finish 
        // computing about what the personas will do next given their current 
        // situation. 
        // We do this by continuously asking the backend server if it is ready. 
        // The backend server is ready when it returns a json that has a key-val
        // pair with "<move>": true.
        // Note that we do not want to overburden the backend too much by 
        // over-querying; so, we have a timer set so we only query it once every
        // timer_max cycles. 
        if (timer <= 0) {
            var update_xobj = new XMLHttpRequest();
            update_xobj.overrideMimeType("application/json");
            update_xobj.open('POST', "update_environment", true);
            update_xobj.addEventListener("load", function () {
                if (this.readyState === 4) {
                    if (update_xobj.status === 200) {
                        if (JSON.parse(update_xobj.responseText)["<step>"] == step) {
                            execute_movement = JSON.parse(update_xobj.responseText)
                            phase = "execute";
                        }
                        timer = timer_max;
                    }
                }
            });
            update_xobj.send(JSON.stringify({ "step": step, "sim_code": sim_code }));
        }
        timer = timer - 1;
    }

    else {
        // This is where we actually move the personas in the visual world. Each
        // backend computation in execute_movement moves each persona by one tile
        // (or some personas might not move if they choose not to). 
        // The execute_count_max is computed by tile_width/movement_speed, which
        // defines a one step sequence in this world. 
        // document.getElementById("game-time-content").innerHTML = execute_movement["meta"]["curr_time"];
        for (let i = 0; i < Object.keys(personas).length; i++) {
            let curr_persona_name = Object.keys(personas)[i];
            let curr_persona = personas[curr_persona_name];
            let curr_pronunciatio = pronunciatios[Object.keys(personas)[i]];

            if (execute_count == execute_count_max) {
                let curr_x = execute_movement["persona"][curr_persona_name]["movement"][0];
                let curr_y = execute_movement["persona"][curr_persona_name]["movement"][1];
                movement_target[curr_persona_name] = [curr_x * tile_width,
                curr_y * tile_width];
                let pronunciatio_content = execute_movement["persona"][curr_persona_name]["pronunciatio"];
                // This is what gives the pronunciatio balloon the name initials. We 
                // use regex to extract the initials of the personas. 
                // E.g., "Dolores Murphy" -> "DM"
                let rgx = new RegExp(/(\p{L}{1})\p{L}+/, 'gu');
                let initials = [...curr_persona_name.matchAll(rgx)] || [];
                initials = (
                    (initials.shift()?.[1] || '') + (initials.pop()?.[1] || '')
                ).toUpperCase();
                pronunciatios[curr_persona_name].setText(initials + ": " + pronunciatio_content);
            }

            console.log(curr_persona_name);
            if (execute_count > 0) {
                if (curr_persona.body.x < movement_target[curr_persona_name][0]) {
                    curr_persona.body.x += movement_speed;
                    anims_direction = "r";
                    pre_anims_direction = "r"
                    pre_anims_direction_dict[curr_persona_name] = "r"
                } else if (curr_persona.body.x > movement_target[curr_persona_name][0]) {
                    curr_persona.body.x -= movement_speed;
                    anims_direction = "l";
                    pre_anims_direction = "l"
                    pre_anims_direction_dict[curr_persona_name] = "l"
                } else if (curr_persona.body.y < movement_target[curr_persona_name][1]) {
                    curr_persona.body.y += movement_speed;
                    anims_direction = "d";
                    pre_anims_direction = "d"
                    pre_anims_direction_dict[curr_persona_name] = "d"
                } else if (curr_persona.body.y > movement_target[curr_persona_name][1]) {
                    curr_persona.body.y -= movement_speed;
                    anims_direction = "u";
                    pre_anims_direction = "u"
                    pre_anims_direction_dict[curr_persona_name] = "u"
                } else {
                    anims_direction = "";
                }

                curr_pronunciatio.x = curr_persona.body.x - 6;
                curr_pronunciatio.y = curr_persona.body.y - 42 - 32; // DEBUG 1 --- I added 32 offset on Dec 29. 

                if (anims_direction == "l") {
                    curr_persona.anims.play("left-walk", true);
                } else if (anims_direction == "r") {
                    curr_persona.anims.play("right-walk", true);
                } else if (anims_direction == "u") {
                    curr_persona.anims.play("up-walk", true);
                } else if (anims_direction == "d") {
                    curr_persona.anims.play("down-walk", true);
                } else {
                    curr_persona.anims.stop();

                    // If we were moving, pick an idle frame to use
                    if (pre_anims_direction_dict[curr_persona_name] == "l") curr_persona.setTexture(curr_persona_name, "left"); else
                        if (pre_anims_direction_dict[curr_persona_name] == "r") curr_persona.setTexture(curr_persona_name, "right"); else
                            if (pre_anims_direction_dict[curr_persona_name] == "u") curr_persona.setTexture(curr_persona_name, "up"); else
                                if (pre_anims_direction_dict[curr_persona_name] == "d") curr_persona.setTexture(curr_persona_name, "down");
                };

            }
            else {
                // Once we are done moving the personas, we move on to the "process"
                // stage where we will send the current locations of all personas at the
                // end of the movemments to the frontend server, and then the backend.
                for (let i = 0; i < Object.keys(personas).length; i++) {
                    let curr_persona_name = Object.keys(personas)[i]
                    let curr_persona = personas[curr_persona_name];
                    curr_persona.body.x = movement_target[curr_persona_name][0];
                    curr_persona.body.y = movement_target[curr_persona_name][1];
                }
                phase = "process";
                execute_count = execute_count_max + 1;
                step = step + 1;
            }
        }

        // Filling in the action description. 
        if (execute_count == execute_count_max) {
            for (let i = 0; i < Object.keys(personas).length; i++) {
                let action_description = ""
                let curr_persona_name = Object.keys(personas)[i];
                let curr_persona_name_os = curr_persona_name.replace(/ /g, "_");
                let description_content = execute_movement["persona"][curr_persona_name]["description"];
                let chat_content = ""

                if (execute_movement["persona"][curr_persona_name]["chat"] != null) {
                    for (let j = 0; j < execute_movement["persona"][curr_persona_name]["chat"].length; j++) {
                        chat_content += execute_movement["persona"][curr_persona_name]["chat"][j][0] + ": " + execute_movement["persona"][curr_persona_name]["chat"][j][1] + "<br>"
                    }
                } else {
                    chat_content = "<em>None at the moment</em>"
                }
                // action_description += description_content + "<br>";

                document.getElementById("current_action__" + curr_persona_name_os).innerHTML = description_content.split("@")[0];
                document.getElementById("target_address__" + curr_persona_name_os).innerHTML = description_content.split("@")[1];
                document.getElementById("chat__" + curr_persona_name_os).innerHTML = chat_content;
            }

        }

        execute_count = execute_count - 1;
    }
}
