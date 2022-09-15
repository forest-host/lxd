
import WebSocket from 'ws';

// Execute all promises in sequence, when done return output
export const map_series = function(things, callback, output = []) {
    let thing = things.shift();
    // Execute promise & remember output
    return callback(thing).then(o => {
        output.push(o);

        if(things.length) {
            return map_series(things, callback, output);
        } else {
            return output;
        }
    })
}

export const wait_for_socket_open = function(socket) {
    // Wait for socket to open before executing operation
    return new Promise((resolve, reject) => {
        // If socket does not open, don't stay here waiting, give it some seconds
        // TODO - this timeout feels wrong
        let timeout = setTimeout(() => {
            socket.close();
            reject(new Error('Unable to open socket'));
        }, 3000);

        // Call this when socket is ready to rumble
        let callback = () => {
            clearTimeout(timeout);
            resolve(socket);
        }

        if (socket.readyState === WebSocket.OPEN) {
            callback();
        } else {
            socket.on('open', callback);
        }
    })
}

