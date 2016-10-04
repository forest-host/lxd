
import exec from 'utilities';

var create = (image, name) => {
	return exec('lxc', ['launch', image, name]);
};

var destroy = (name) => {
	return exec('lxc', ['delete', name, '--force']);
};

var list = () => {
	return exec('lxc', ['list', '--format=json'])
		.then(output => output.stdout.map(line => JSON.parse(line.toString())))
		.then(lines => lines[0]);
};

var copy_to = (name, host_path, container_path) => {
	
};

export {create};
export {destroy};
export {list};

export default {
	create: create,
	destroy: destroy,
	list: list,
};
