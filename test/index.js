
import Promise from 'bluebird';
import fs from 'fs';
//import path from 'path';
import chai from 'chai';
import exec from 'utilities';
chai.should();

import lxc from '../lib';

var stat = Promise.promisify(fs.stat);

var name = 'test';
var image = 'builder';
//var directory = 'dist';
//var container_path = '/var/dist';
var mount = '/var/forest/mounts/builds';

describe('LXC Module', () => {
	var container;

	describe('launch', () => {
		it('Creates container', function() {
			this.timeout(30000);
			return lxc.launch(image, name)
				.then(obj => container = obj)
				.then(() => lxc.list())
				.then(list => list.should.have.length(1))

				// Get container when it exists to stop tests from failing
				.catch(() => {
					return lxc.get(name)
						.then(obj => container = obj);
				});
		});
	});
	
	/*
	describe('wait_for_dhcp', () => {
		it('returns after address after dhcp is done', function() {
			this.timeout(60000);

			return container.info()
				.then(config => {
					var addresses = config.state.network.eth0.addresses.filter(address => {
						return address.family == 'inet';
					});

					addresses.should.have.length(0);

					return container.wait_for_dhcp();
				})
				.then(address => {
					address.should.have.property('address');
				});
		});
	});
	*/

	describe('info', () => {
		it('returns config of container', () => {
			return container.info()
				.then(config => config.should.have.property('name'));
		});
	});

	describe('state', () => {
		it('returns state of container', () => {
			return container.state()
				.then(state => state.status.should.equal('Running'));
		});
	});

	describe('list', () => {
		it('Lists containers', () => {
			return lxc.list()
				.then(list => {
					list.should.have.length(1);
				});
		});
	});

	describe('exec', () => {
		it('Executes command in container', function() {
			this.timeout(10000);

			return container.exec('hostname')
				.then(output => output.stdout.should.contain(name));
		});
	});

	describe('update', () => {
		var cpu = '1';

		it('Updates container config', () => {
			return container.update({
				config: {
					'limits.cpu': cpu
				}
			})
			.then(info => {
				info.config['limits.cpu'].should.equal(cpu);
			});
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
	*/

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
				.then(() => lxc.list())
				.then(list => list.should.have.length(0));
		});
	});

	/*
	describe('unmount', () => {
		it('Unmounts data volume from container');
	});
	*/
});
