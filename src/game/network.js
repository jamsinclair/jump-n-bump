import { MOVEMENT, player } from "../game/game";
import { env } from "../interaction/game_session";
import Peer from 'peerjs';
import ko from 'knockout';

export const net_info = ko.observable([]);

let LAG = 0; // change
let buggered_off = 0;
let is_server = 1;
let is_net = 0;
let server_said_bye = 0;
let client_player_num = -1;
let sock = null;
let socketset = [];

let peer = null;
let lastPeerId = null;

const NETCMD = {
  NACK: 0,
  ACK: 1,
  HELLO: 2,
  GREENLIGHT: 3,
  MOVE: 4,
  BYE: 5,
  POSITION: 6,
  ALIVE: 7,
  KILL: 8,
  PING: 9,
  PONG: 10,
};

function getPlayerName (name, playerNumber) {
  return (name || `player${playerNumber + 1}`).substring(0, 10);
}

function processMovePacket (packet) {
  const { arg: player_id, arg2: [movement_type, new_val], arg3, arg4 } = packet;

  if (movement_type === MOVEMENT.LEFT) {
    player[player_id].action_left = new_val;
  } else if (movement_type === MOVEMENT.RIGHT) {
    player[player_id].action_right = new_val;
  } else if (movement_type === MOVEMENT.UP) {
    player[player_id].action_up = new_val;
  } else {
    console.warn('bogus movement_type in packet')
  }

  // player[player_id].x.pos = arg3;
  // player[player_id].y.pos = arg4;
}

export function tellServerPlayerMoved (player_id, movement_type, new_val) {
  const packet = {
    cmd: NETCMD.MOVE,
    arg: player_id,
    arg2: [movement_type, new_val],
    arg3: player[player_id].x.pos,
    arg4: player[player_id].y.pos
  };

  if (is_server) {
    processMovePacket(packet);
    if (is_net) {
      sendPacketToAll(packet);
    }
  } else  {
    setTimeout(() => {
      sendPacketToSock(sock, packet);
    }, (LAG));
  }
}

export function serverSendKillPacket (killer, victim, bumps, bumped) {
  if (!is_server) {
    return;
  }

  const packet = {
    cmd: NETCMD.KILL,
    arg: killer,
    arg2: victim,
    arg3: bumps,
    arg4: bumped
  };

  processKillPacket(packet);
  if (is_net) {
    sendPacketToAll(packet);
  }
}

function processKillPacket (packet) {
  const {
    arg,
    arg2,
    arg3,
    arg4
  } = packet;

  const killer = player[arg];
  killer.bumps = arg3;
  killer.bumped[arg2] = arg4;
}

function sendPacketToSock (socket, packet) {
    packet.timestamp = Date.now();
    socket && socket.send(packet);
}

function sendPacket (player_id, packet) {
  if (player_id < env.JNB_MAX_PLAYERS && player_id >= 0) {
    if (player[player_id].enabled && player_id != client_player_num) {
      sendPacketToSock(net_info()[player_id].sock, packet)
    }
  }
}

function sendPacketToAll (packet) {
  for (let i = 0; i < env.JNB_MAX_PLAYERS; i++) {
    sendPacket(i, packet);
  }
}

function grabPacket (packetSet = []) {
  return packetSet.shift();
}

function tellServerGoodbye () {
  if (!buggered_off) {
    buggered_off = 1;
    const packet = {
      cmd: NETCMD.BYE,
      arg: client_player_num,
    };
    sendPacketToSock(sock, packet);
  }
}

export function tellServerNewPosition () {
  const newPacket = {
    cmd: NETCMD.POSITION,
    arg: client_player_num,
    arg2: player[client_player_num].x.pos,
    arg3: player[client_player_num].y.pos
  };

  if (is_server) {
    sendPacketToAll(newPacket);
  } else {
    setTimeout(() => {
      sendPacketToSock(sock, newPacket);
    }, LAG);
  }
}

function processPositionPacket (packet) {
  const player_id = packet.arg;
  player[player_id].x.pos = packet.arg2;
  player[player_id].y.pos = packet.arg3;
}

function processAlivePacket (packet) {
  const player_id = packet.arg;
  player[player_id].dead_flag = 0;
  player[player_id].x = packet.arg2;
  player[player_id].y = packet.arg3;
}

function serverTellEveryoneGoodbye () {
  if (!buggered_off) {
    buggered_off = 1;
    for (let i = 0; i < env.JNB_MAX_PLAYERS; i++) {
      if (player[i].enabled) {
        const newPacket = {
          cmd: NETCMD.BYE,
          arg: i,
        }
        sendPacketToAll(newPacket);
      }
    }
  }
  if (peer) {
    setTimeout(() => peer.destroy(), 1000);
  }
}

export function update_players_from_server () {
  if (is_server) {
    return;
  }

  let packet = grabPacket(socketset);

  while (packet) {
    if (packet.cmd === NETCMD.BYE) {
      player[packet.arg].enabled = 0;
    } else if (packet.cmd === NETCMD.MOVE) {
      processMovePacket(packet);
    } else if (packet.cmd === NETCMD.ALIVE) {
      processAlivePacket(packet);
    } else if (packet.cmd === NETCMD.POSITION) {
      processPositionPacket(packet);
    } else if (packet.cmd === NETCMD.KILL) {
      processKillPacket(packet);
    } else {
      console.warn(`CLIENT: Got an unknown packet: ${packet.arg}`);
    }

    packet = grabPacket(socketset);
  }

  return 1;
}

export function serverSendAlive (player_id) {
  if (!is_server) {
    return;
  }

  const packet = {
    cmd: NETCMD.ALIVE,
    arg: player_id,
    arg2: player[player_id].x,
    arg3: player[player_id].y
  };
  sendPacketToAll(packet);
}

function handleClientDisconnect (playerId, isClosed) {
  const _net_info = net_info();

  if (!isClosed) {
    setTimeout(() => _net_info.sock.close(), 500);
  }
  
  if (playerId === null) {
    console.log(`SERVER: non-player client disconnected`);
    return;
  } 
  
  console.log(`SERVER: player ${playerId} said goodbye`);
  
  _net_info[playerId].sock = null;
  _net_info[playerId].socketset = [];
  net_info(_net_info);
  player[playerId].enabled = 0;
  sendPacketToAll({ cmd: NETCMD.BYE, arg: playerId });
};

export function update_players_from_clients () {
  if (!is_server) {
    return;
  }

  for (let i = 0; i < env.JNB_MAX_PLAYERS; i++) {
    if (i === client_player_num || !player[i].enabled) {
      continue;
    }

    const playerId = i;
    const _net_info = net_info();

    _net_info[playerId].socketset.forEach(packet => {
      if (packet.cmd === NETCMD.POSITION) {
        processPositionPacket(packet);
        for (i = 0; i < env.JNB_MAX_PLAYERS; i++) {
          if (i != playerId) {
            sendPacket(i, packet);
          }
        }
      } else if (packet.cmd === NETCMD.MOVE) {
        processMovePacket(packet);
        sendPacketToAll(packet);
      } else {
        console.warn(`SERVER: Got unknown packet ${packet.cmd}`);
      }
    });

    _net_info[playerId].socketset = [];
    net_info(_net_info);
  } 
}

function init_server_peer () {
  return new Promise((resolve) => {
    peer = new Peer('jamie-test-1234', { debug: 2, host: '9000-ced39531-3538-4acb-bb67-6f32c5d165a5.ws-eu03.gitpod.io' });
    
    peer.on('open', (conn) => {
      const newNetInfo = net_info();
      newNetInfo[client_player_num].sock = conn;
      net_info(newNetInfo);
      resolve();
    });
    
    peer.on('connection', (clientSock) => {
      clientSock.on('open', function() {
          let playerId = null;
          const allPlayersConnected = () => net_info().every(player => player.sock);
          const sendNack = () => {
            console.log(`SERVER: Forbidding connection ${clientSock.peer}`);
            sendPacketToSock(clientSock, { cmd: NETCMD.NACK });
            setTimeout(() => clientSock.close(), 500);
          }

          if (allPlayersConnected()) {
            sendNack();
            return;
          }

          const sendPing = () => {
            if (playerId !== null) {
              const newNetInfo = net_info();
              newNetInfo[playerId].lastPinged = Date.now();
              net_info(newNetInfo);
            }

            if (clientSock.open) {
              sendPacketToSock(clientSock, { cmd: NETCMD.PING });
            }
            setTimeout(sendPing, 1500);
          };

          setTimeout(sendPing, 1500);

          clientSock.on('data', (packet) => {

            if (packet.cmd === NETCMD.HELLO) {
              if (allPlayersConnected()) {
                sendNack();
                return;
              }

              for (let [i, netData] of net_info().entries()) {
                if (i === client_player_num || netData.sock) {
                  continue;
                }

                playerId = i;
                console.log('SERVER: Granting connection.');
                console.log(`SERVER: assigning ${playerId} as player number to client ${clientSock.peer}`);
                player[i].enabled = 1;
                const newNetInfo = net_info();
                newNetInfo[i].sock = clientSock;
                newNetInfo[i].name = getPlayerName(packet.arg, i);
                net_info(newNetInfo);
                sendPacketToSock(clientSock, { cmd: NETCMD.ACK, arg: i });
                break;
              }

              return clientSock.on('close', () => {
                handleClientDisconnect(playerId, true);
                playerId = null;
              });
            }

            if (packet.cmd === NETCMD.PONG && typeof playerId === 'number') {
              console.log('got pong')
              const newNetInfo = net_info();
              newNetInfo[playerId].ping = Date.now() - newNetInfo[playerId].lastPinged;
              net_info(newNetInfo);
              return;
            }

            if (packet.cmd === NETCMD.BYE) {
              handleClientDisconnect(playerId);
              playerId = null;
              return;
            }

            if (typeof playerId === 'number') {
              const newNetInfo = net_info();
              newNetInfo[playerId].socketset.push(packet);
              net_info(newNetInfo);
            }
          });

          clientSock.on('close', () => handleClientDisconnect(null, true));
      });
    });
    
    peer.on('disconnected', function () {
      console.warn('SERVER: Connection lost. Please reconnect');
    });
    
    peer.on('close', () => {
      conn = null;
      console.log('SERVER: connection destroyed');
    });
    
    peer.on('error', console.error);
  });
}

function init_client_peer () {
  return new Promise((resolve) => {
    peer = new Peer(null, { debug: 2, host: '9000-ced39531-3538-4acb-bb67-6f32c5d165a5.ws-eu03.gitpod.io' });
    
    peer.on('open', () => {
      // Workaround for peer.reconnect deleting previous id
      if (peer.id === null) {
          console.log('Received null id from peer open');
          peer.id = lastPeerId;
      } else {
          lastPeerId = peer.id;
      }

      resolve();
    });
    
    peer.on('connection', (c) => {
      c.on('open', function() {
          c.send("Client does not accept incoming connections");
          setTimeout(() => c.close(), 500);
      }); 
    });
    
    peer.on('disconnected', function () {
      console.log('CLIENT: Connection lost. Please reconnect');
    
      // Workaround for peer.reconnect deleting previous id
      peer.id = lastPeerId;
      peer._lastServerId = lastPeerId;
      peer.reconnect();
    });
    
    peer.on('close', () => {
      conn = null;
      console.log('CLIENT: connection destroyed');
    });
    
    peer.on('error', console.error);
  });
}

export async function init_server (player_name) {
  is_net = 1;
  is_server = 1;
  server_said_bye = 0;
  buggered_off = 0;
  
  /** assign player number zero as default for the server */
  if(client_player_num === -1) {
    client_player_num = 0;
  }

  for (let i = 0; i < env.JNB_MAX_PLAYERS; i++) {
    const newNetInfo = net_info();
    newNetInfo[i] = { sock: null, socketset: [], ping: 0 };
    newNetInfo[client_player_num].name = getPlayerName(player_name, client_player_num);
    net_info(newNetInfo);
  }

  player[client_player_num].enabled = 1;
  player[client_player_num].is_client_player = true;

  await init_server_peer();
  return peer.id;
}

export function server_send_greenlight () {
  const packet = { cmd: NETCMD.GREENLIGHT };
  for (let i = 0; i < env.JNB_MAX_PLAYERS; i++) {
    const data = {
      enabled: player[i].enabled,
      x: player[i].x,
      y: player[i].y,
    }
    if (i === 0) {
      packet.arg = data;
      continue;
    }
    packet[`arg${i + 1}`] = data;
  }

  console.log('SERVER: sending greenlight and starting game.')
  sendPacketToAll(packet);
}

export async function connect_to_server (server_id, player_name) {
  is_net = 1;
  is_server = 0;
  server_said_bye = 0;
  buggered_off = 0;

  await init_client_peer();
  sock = peer.connect(server_id, { reliable: true });

  sock.on('open', () => {
    console.log(`CLIENT: connected to server ${server_id}`);
    console.log('CLIENT: Sending HELLO packet...');
    sendPacketToSock(sock, { 
      cmd: NETCMD.HELLO,
      arg: player_name,
    });
  });

  sock.on('close', () => {
    server_said_bye = 1;
    sock = null;
  });

  return new Promise((resolve, reject) => {
    let receivedAck = false;
    let receivedGreenlight = false;

    sock.on('data', (packet) => {
      if (packet.cmd === NETCMD.PING) {
        sendPacketToSock(sock, { cmd: NETCMD.PONG });
        return;
      }

      if (receivedAck && receivedGreenlight) {
        setTimeout(() => {
          socketset.push(packet);
        }, (LAG));
        return;
      }

      if (!packet || typeof packet.cmd !== 'number') {
        console.error('CLIENT: invalid packet received from server');
        reject();
        return;
      }

      if (packet.cmd === NETCMD.NACK) {
        console.log('CLIENT: Server forbid us from playing');
        sock.close();
        reject();
        // @todo update game state
      }

      if (packet.cmd === NETCMD.ACK) {
        client_player_num = packet.arg;
        player[client_player_num].is_client_player = true;
        receivedAck = true;
        console.log('CLIENT: Server accepted us to the game.');
        console.log('CLIENT: Waiting for greenlight...');
      }

      if (receivedAck && packet.cmd === NETCMD.GREENLIGHT) {
        receivedGreenlight = true;
        console.log('CLIENT: got greenlit.');

        for (let i = 0; i < env.JNB_MAX_PLAYERS; i++) {
          const data = packet[i === 0 ? 'arg' : `arg${i + 1}`];
          player[i].enabled = data.enabled;
          player[i].x = data.x;
          player[i].y = data.y;
        }

        resolve();
      }
    });
  });
}

export function reset_network () {
  is_net = 0;
  is_server = 1;
  server_said_bye = 0;
  buggered_off = 0;
  net_info([]);
}
