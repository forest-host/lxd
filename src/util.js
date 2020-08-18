
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

/**
 * Reduce variables to lxd config object
 */
export const get_variables_as_config = function(variables) {
	// Return undefined to not set anything when no vars are set
	if(typeof(variables) == 'undefined') {
		return undefined;
	}

	return Object.keys(variables).reduce((aggregate, name) => {
		// Set correct config key & value
		aggregate['environment.' + name] = variables[name];
		// Return object
		return aggregate;
	}, {});
}

/**
 * Reduce mounts array to lxd devices object
 */
export const get_mounts_as_devices = function(mounts) {
	return mounts.reduce((aggregate, mount) => {
		aggregate[mount.name] = {
			source: mount.source,
			path: mount.path,
			type: 'disk',
		};
		return aggregate;
	}, {});
}

/**
 * Reduce volumes array to lxd device object
 */
export const get_volumes_as_devices = function(volumes) {
	return volumes.reduce((aggregate, volume) => {
		aggregate[volume.name] = {
			path: volume.path,
			source: volume.volume,
			pool: volume.pool,
			type: 'disk',
		};
		return aggregate;
	}, {});
}

export const wait_for_socket_open = function(socket) {
	// Wait for socket to open before executing operation
	return new Promise((resolve, reject) => {
    // If socket does not open, don't stay here waiting, give it some seconds
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

