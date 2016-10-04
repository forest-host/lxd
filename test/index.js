//import assert from 'assert';

import chai from 'chai';
chai.should();

import lxc from '../lib';

function clean_output(output) {
	return output.stdout.map(line => line.toString().replace('\n', ''));
}

describe('LXC Module', () => {
	var name = 'test';
	var image = 'test';

	// TODO set / unset config?
	describe('create', () => {
		it('Creates container', function() {
			this.timeout(30000);
			return lxc.create(image, name)
				.then(() => lxc.list())
				.then(list => list.should.have.length(1));
		});
	});

	describe('list', () => {
		it('Lists containers', () => {
			return lxc.list()
				.then(list => {
					list.should.have.length(1);
					list[0].name.should.equal(name);
				});
		});
	});

	describe('execute', () => {
		it('Executes command in container', () => {
			var options = {
				cwd: '/',
				user: 'forest',
			};

			return lxc.execute(name, 'hostname', options)
				.then(clean_output)
				.then(lines => lines[0])
				.then(output => output.should.equal(name))
		});
	});

	describe('copy_to', () => {
		var directory = 'dist';
		var path = __dirname.replace('test', directory);

		it('Does not accept relative paths', done => {
			lxc.copy_to(name, '../', '/home/ubuntu/')
				.then(() => done(new Error('Relative path accepted')))
				.catch(() => done());
		});

		it('Copies data from host to container', () => {
			return lxc.copy_to(name, path, '/home/ubuntu/')
				.then(() => lxc.execute(name, 'ls /home/ubuntu'))
				.then(clean_output)
				.then(lines => lines[0])
				.then(line => line.should.equal(directory));
		});
	});

	describe('destroy', () => {
		it('Destroys container', function() {
			this.timeout(5000);
			return lxc.destroy(name)
				.then(() => lxc.list())
				.then(list => list.should.have.length(0));
		});
	});

	describe('copy_from', () => {
		it('Copies data from container to host');
	});

	describe('mount', () => {
		it('Mounts data volume on container');
	});

	describe('unmount', () => {
		it('Unmounts data volume from container');
	});
});
