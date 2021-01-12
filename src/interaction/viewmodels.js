"use strict";

import { create_default_level } from "../asset_data/default_levelmap";
import { Dat_Level_Loader } from "../resource_loading/dat_level_loader";
import { Game_Session } from "../interaction/game_session";
import { Scores_ViewModel } from "../interaction/scores_viewmodel";
import ko from "knockout";
import 'whatwg-fetch'

const loader = new Dat_Level_Loader();

function Enum(obj) {
    return Object.freeze ? Object.freeze(obj) : obj;
}

const CustomLevel = function(name, filename, load) {
    this.name = name;
    this.filename = filename;
    this.load = load || function() {        
        return fetch('levels/' + this.filename + '/' + this.filename + '.dat')
        .then(r => r.blob())
        .then(file => file.arrayBuffer())
        .then(array => loader.load(array));        
    }
};

function ViewModel() {
    "use strict";
    var self = this;
    this.Page = Enum({ Instructions: 0, Game: 1, Scores: 2, Waiting_For_Players: 3 });
    this.loading_level = ko.observable(true);
    this.availableLevels = ko.observableArray([
        new CustomLevel("Original", "default", () => Promise.resolve(create_default_level())),
        new CustomLevel("Caves", "caves"),
        new CustomLevel("Cocaine", "cocaine"),
        new CustomLevel("Green", "green"),
        new CustomLevel("Jump2", "jump2"),
        new CustomLevel("King of the Hill", "kingofthehill"),
        new CustomLevel("Mario", "mario"),
        new CustomLevel("S General", "sgeneral"),
        new CustomLevel("Spring", "spring"),
        new CustomLevel("Swamp", "swamp"),
        new CustomLevel("Thomas", "thomas"),
        new CustomLevel("Topsy", "topsy"),
        new CustomLevel("Waterfall", "waterfall")
    ]);
    this.current_level = create_default_level();
    this.current_game = ko.observable(new Game_Session(this.current_level));
    this.selected_custom_level = ko.observable(this.availableLevels()[0]);
    
    this.current_page = ko.pureComputed(function () {
        return self.current_game().game_state();
    });

    this.scores_viewmodel = ko.pureComputed(function () {
        return new Scores_ViewModel(self.current_game().scores());
    });

    // For network multiplayer
    this.server_player_name = ko.observable('');
    this.server_game_id = ko.pureComputed(function () {
        return 'jamie-test-123';
        return self.current_game().game_id();
    });
    this.server_network_players = ko.pureComputed(function () {
        return self.current_game().net_info().map(info => info && info.name);
    });
    this.client_player_name = ko.observable('');
    this.client_game_id = ko.observable('jamie-test-123');
    this.canStartNetworkGame = ko.pureComputed(function () {
        return self.server_player_name() && !self.loading_level();
    });

    this.canJoinNetworkGame = ko.pureComputed(function () {
        return self.client_player_name() && self.client_game_id() && !self.loading_level();
    });

    this.restart = function () {
        self.current_game(new Game_Session(self.current_level, true, false, null));
        self.current_game().start();
    };

    this.init_network_game = function () {
        self.current_game(new Game_Session(self.current_level, true, true, null, self.server_player_name()));
        self.current_game().init_network_game();
    };

    this.start_network_game = function () {
        self.current_game().start_network_game();
    };

    this.join_network_game = function () {
        self.current_game(new Game_Session(self.current_level, false, true, self.client_game_id(), self.client_player_name()));
        self.current_game().wait_for_greenlight();
    };

    this.on_level_change = function() {
        this.load_customlevel(this.selected_custom_level());
    }

    this.load_level_from_file = function(filepath, filedata) {
        const filename = filepath.split(/[\\\/]/).pop();
        const customLevel = new CustomLevel(filename, filename, () =>
             this.get_data_from_filename(filedata).then(array => loader.load(array))
        );
        this.availableLevels.push(customLevel);
        this.selected_custom_level(customLevel);
        this.on_level_change();
    };

    this.get_data_from_filename = function(filename) {
        return new Promise((resolve, reject) => {
          let fr = new FileReader();
          fr.onload = x => resolve(fr.result);
          fr.readAsArrayBuffer(filename)
      });
    };
    
    this.load_customlevel = function(customLevel) {
        this.loading_level(true);
        customLevel.load().then(level => {
            self.current_level = level;
            self.current_game(new Game_Session(self.current_level));
            self.loading_level(false);
        }).catch(function(ex) {
            console.log('Loading level data failed', ex)
        });
    };

    this.on_level_change();
};

ko.applyBindings(new ViewModel());