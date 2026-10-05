export { handle } from './hooks-standard';

export const websocket: Bun.WebSocketHandler<undefined> = {
  message(socket, message) {
    socket.send(message);
  },
};
