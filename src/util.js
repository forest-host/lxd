
// Execute all promises in sequence, when done return output
export function map_series(things, callback, output = []) {
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

