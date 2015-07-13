var env = {
    JNB_MAX_PLAYERS: 4,
    MAX_OBJECTS: 200,
    animation_data: new Animation_Data()
};

var player = [];

function init() {
    function gup(name) {
        name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regexS = "[\\?&]" + name + "=([^&#]*)";
        var regex = new RegExp(regexS);
        var results = regex.exec(window.location.href);
        if (results == null)
            return "";
        else
            return results[1];
    }

    var canvas = document.getElementById('screen');
    var img = {};
    img.level = document.getElementById('level');
    img.mask = document.getElementById('mask');
    img.rabbits = document.getElementById('rabbits');
    img.objects = document.getElementById('objects');
    img.numbers = document.getElementById('numbers');

    var settings = {
        pogostick: gup('pogostick') == '1',
        jetpack: gup('jetpack') == '1',
        bunnies_in_space: gup('space') == '1',
        flies_enabled: false,
        blood_is_thicker_than_water: false,
        no_gore: false
    };
    var muted = gup('nosound') == '1';

    var sound_player = new Sound_Player(muted);
    var sfx = new Sfx(sound_player);
    var renderer = new Renderer(canvas, img);
    var objects = new Objects();
    var movement = new Movement(renderer, img, sfx, objects, settings);
    var keyboard = new Keyboard(sound_player);
    var ai = new AI(keyboard);
    var animation = new Animation(renderer, img, objects);
    var game = new Game(movement, ai, animation, renderer, objects, keyboard.key_pressed, true);
    document.onkeydown = keyboard.onKeyDown;
    document.onkeyup = keyboard.onKeyUp;
    sfx.music();
    game.start();
}

function rnd(max_value) {
    return Math.floor(Math.random() * max_value);
}