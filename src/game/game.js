import { env } from "../interaction/game_session";
import { Player } from "./player";
import { SET_BAN_MAP } from "./level";
import * as network from "./network";

export const player_action_cache = [];

export const MOVEMENT = {
    LEFT: 1,
    RIGHT: 2,
    UP: 3
};

export let player = [];

export function Game(movement, ai, animation, renderer, objects, key_pressed, level, rnd, is_server, is_net, game_id, player_name) {
    "use strict";
    var next_time = 0;
    var playing = false;
    reset_players();
    reset_level();
    network.reset_network();

    function reset_players() {
        player = [
        new Player(0, [37, 39, 38], is_server, rnd),
        new Player(1, [65, 68, 87], is_server, rnd),
        new Player(2, [100, 102, 104], is_server, rnd),
        new Player(3, [74, 76, 73], is_server, rnd)
        ];

        if (is_net) {
            // When network game disable all players by default
            player.forEach(player => player.enabled = 0);
        }
    }

    function reset_level() {
        SET_BAN_MAP(level.ban_map);
        objects.reset_objects();

        for (var c1 = 0; c1 < env.JNB_MAX_PLAYERS; c1++) {
            player[c1].bumps = 0;
            for (var c2 = 0; c2 < env.JNB_MAX_PLAYERS; c2++) {
                player[c1].bumped[c2] = 0;
            }
            if (player[c1].enabled) {
                player[c1].position_player(c1);
            }
        }
    }

    function timeGetTime() {
        return new Date().getTime();
    }

    function update_player_actions() {
        let tmp;

        const isValidKeyPress = (player_id, value, action) => {
            if (!player_action_cache[i]) {
                player_action_cache[i] = {};
            }

            if (typeof value !== 'boolean') {
                return false;
            };

            const valid = value !== player[player_id][action] && value !== player_action_cache[player_id][action];
            if (valid) {
                player_action_cache[player_id][action] = value;
            }
            return valid;
        }

        for (var i = 0; i != player.length; ++i) {
            if (!player[i].enabled) {
                continue;
            }

            if (env.is_net && !player[i].is_client_player) {
                continue;
            }

            tmp = key_pressed(player[i].keys[0]);
            if (isValidKeyPress(i, tmp, 'action_left')) {
                player[i].action_left = tmp;
                network.tellServerPlayerMoved(i, MOVEMENT.LEFT, tmp);
            }
            tmp = key_pressed(player[i].keys[1]);
            if (isValidKeyPress(i, tmp, 'action_right')) {
                player[i].action_right = tmp;
                network.tellServerPlayerMoved(i, MOVEMENT.RIGHT, tmp);
            }
            tmp = key_pressed(player[i].keys[2]);
            if (isValidKeyPress(i, tmp, 'action_up')) {
                player[i].action_up = tmp;
                network.tellServerPlayerMoved(i, MOVEMENT.UP, tmp);
            }
        }
    }

    function steer_players() {
        ai.cpu_move();
        update_player_actions();
        for (var playerIndex = 0; playerIndex != player.length; ++playerIndex) {
            var p = player[playerIndex];
            if (p.enabled) {
                if (!p.dead_flag) {
                    movement.steer_player(p);
                }
                p.update_player_animation();
            }
        }
    }


    function game_iteration() {
        if (is_net) {
            if (is_server) {
                network.update_players_from_clients();
            } else {
                network.update_players_from_server();
            }
        }

        steer_players();
        movement.collision_check();
        animation.update_object();
        renderer.draw();

        if (is_net) {
            const currentPlayer = player.find(p => p.is_client_player);
            if ( (currentPlayer.dead_flag == 0) &&
                (
                 (currentPlayer.action_left) ||
                 (currentPlayer.action_right) ||
                 (currentPlayer.action_up) ||
                 (currentPlayer.jump_ready == 0)
                )
               ) {
                console.log('telling server new position')
                network.tellServerNewPosition();
            }
        }
    }

    function pump() {
        while (playing) {
            game_iteration();
            var now = timeGetTime();
            var time_diff = next_time - now;
            next_time += (1000 / 60);

            if (time_diff > 0) {
                // we have time left
                setTimeout(pump, time_diff);
                break;
            }
        }
    }

    this.start = function () {
        next_time = timeGetTime() + 1000;
        playing = true;
        pump();
    }

    this.pause = function () {
        playing = false;
    }

    this.init_network_game = () => {
        if (is_server && is_net) {
            return network.init_server(player_name);
        }

        return Promise.reject(new Error('Invalid network game state'));
    }

    this.wait_for_greenlight = () => {
        if (!is_server && is_net) {
            return network.connect_to_server(game_id, player_name);
        }
        return Promise.reject(new Error('Invalid network game state'));
    }

    this.start_network_game = () => {
        if (is_server && is_net) {
            reset_level();
            network.server_send_greenlight();
        }
    }
}