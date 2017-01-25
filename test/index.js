
import Promise from 'bluebird';
import fs from 'fs';
import extend from 'extend';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.should();
chai.use(chaiAsPromised);

import exec from 'utilities';

import LXC from '../lib';

var stat = Promise.promisify(fs.stat);

var name = 'test';
var image = 'test';
var mount = '/var/forest/mounts/builds';

var config = {
	key: fs.readFileSync(__dirname + '/client.key'),
	cert: fs.readFileSync(__dirname + '/client.crt'),
	port: '8443',
	host: '10.0.0.2',
};

var lxc;

describe('LXC Client', () => {
	before(() => {
		lxc = new LXC(config);
	});

	it('Throws an error when wrongly configured', () => {
		new LXC(extend({}, config, { host: '10.0.0.5' })).list().should.be.rejected;
	});

	it('Returns results when rightly configured', () => {
		new LXC(config).list().should.not.be.rejected;
	});

	describe('get_container()', () => {
		it('Returns container instance', () => {
			lxc.get_container(name).should.be.a('object');
		});
	})

	describe('list()', () => {
		it('Responds with a array', () => {
			lxc.list().should.eventually.be.a('array');
		});
	})

	describe('launch()', () => {
		it('Creates container', function() {
			this.timeout(10000);

			return lxc.launch(image, name)
				.then(container => container.get_state())
				.should.eventually.have.property('status').that.equals('Running');
		});
	});
});

describe('Container', () => {
	describe('wait_for_dhcp()', () => {
		it('Returns after address after dhcp is done', function() {
			this.timeout(10000);

			return lxc.get_container(name).get_ipv4_addresses()
				.should.eventually.have.length(0)
				.then(() => lxc.get_container(name).wait_for_dhcp())
				.then(() => lxc.get_container(name).get_ipv4_addresses())
				.should.eventually.have.length(1);
		});
	});

	describe('get_info()', () => {
		it('Returns config of container', () => {
			return lxc.get_container(name).get_info()
				.then(config => config.should.have.property('name'));
		});
	});

	describe('get_state()', () => {
		it('returns state of container', () => {
			return lxc.get_container(name).get_state()
				.then(state => state.status.should.equal('Running'));
		});
	});

	describe('exec()', () => {
		it('Executes command in container', function() {
			this.timeout(10000);

			return lxc.get_container(name).exec('hostname')
				.then(output => output.stdout.should.contain(name));
		});
	});

	describe('update', () => {
		it('Updates container config', () => {
			return lxc.get_container(name)
				.update({ config: { 'environment.CONTAINER_NAME': name } })
				.should.eventually.have.property('config').that.has.property('environment.CONTAINER_NAME').that.equals(name);
		});
	});

	describe('delete()', () => {
		it('Deletes container', function() {
			this.timeout(10000);

			return lxc.get_container(name).delete()
				.then(() => lxc.list())
				.should.eventually.be.a('Array').with.length(0);
		});
	});

	/*
	describe('upload', () => {
		var host_path = __dirname.replace('test', directory);

		it('Does not accept relative paths', done => {
			container.upload('../', container_path)
				.then(() => done(new Error('Relative path accepted')))
				.catch(() => done());
		});

		it('Copies data from host to container', () => {
			return container.upload(host_path, container_path)
				.then(() => container.exec('ls', [path.dirname(container_path)]))
				.then(parse_output)
				.then(split_newlines)
				.then(lines => lines.should.contain(directory));
		});

		it('Errors when host path does not exist', () => {
			return container.upload('/path/does/not/exist', container_path)
				.then(() => {
					throw new Error();
				})
				.catch(err => err.message.should.contain('not exist'));
		});
	});

	describe('download', () => {
		var host_path = '/tmp/testing';

		it('Errors when container path does not exist', () => {
			return container.download('/path/does/not/exist', host_path)
				.then(() => {
					throw new Error();
				})
				.catch(err => err.message.should.contain('not exist'));
		});

		it('Copies data from container to host', () => {
			return container.download(container_path, host_path)
				.then(() => exec('ls', [host_path]))
				.then(parse_output)
				.then(split_newlines)
				.then(output => {
					output.should.contain('index.js');
				});
		});

		it('Errors when host path exists', () => {
			return container.download(container_path, host_path)
				.then(() => {
					throw new Error();
				})
				.catch(err => err.message.should.contain('exists'));
		});

		// Remove tmp dir after
		after(() => {
			return exec('rm', ['-rf', host_path]);
		});
	});

	// TODO - mount zfs block device
	// Mount a share on container
	describe('add_disk', () => {
		var filename = 'test_mount';

		it('Mounts data volume on container', () => {
			return container.add_disk('test', mount, '/var/forest')
				.then(() => container.exec('touch', ['/var/forest/'+filename]))
				.then(() => stat(mount+'/'+filename))
				.then(() => exec('rm', [mount+'/'+filename]));
		});
	});

	describe('destroy', () => {
		it('Destroys container', function() {
			this.timeout(5000);
			return container.destroy()
				.then(() => client.list())
				.then(list => list.should.have.length(0));
		});
	});

	describe('unmount', () => {
		it('Unmounts data volume from container');
	});
	*/
});
