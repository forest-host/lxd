
import Promise from 'bluebird';
import fs from 'fs';
import extend from 'extend';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.should();
chai.use(chaiAsPromised);

import LXC from '../lib';

var config = {
	client: {
		key: fs.readFileSync(__dirname + '/client.key'),
		cert: fs.readFileSync(__dirname + '/client.crt'),
		port: '8443',
		host: '10.0.0.1',
	},
	container: {
		name: 'test',
		image: 'test',
		mount: {
			source: '/var',
			path: '/host_var',
			name: 'test',
		},
		upload: {
			source: __dirname + '/transfer.txt',
			path: '/uploaded.txt',
		},
		download: {
			source: '/uploaded.txt',
			path: __dirname + '/downloaded.txt',
		},
	},
};

var lxc;
var container;

describe('LXC Client', () => {
	before(() => {
		lxc = new LXC(config.client);
	});

	it('Throws an error when wrongly configured', () => {
		new LXC(extend({}, config.client, { host: '10.0.0.5' })).list().should.be.rejected;
	});

	it('Returns results when rightly configured', () => {
		new LXC(config.client).list().should.not.be.rejected;
	});

	describe('get_container()', () => {
		it('Returns container instance', () => {
			container = lxc.get_container(config.container.name);
			container.should.be.a('object');
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

			return lxc.launch(config.container.image, config.container.name)
				.then(container => container.get_state())
				.should.eventually.have.property('status').that.equals('Running');
		});
	});
});

describe('Container', () => {
	describe('wait_for_dhcp()', () => {
		it('Returns address after dhcp is done', function() {
			this.timeout(10000);

			return container.get_ipv4_addresses()
				.should.eventually.have.length(0)
				.then(() => container.wait_for_dhcp())
				.then(() => container.get_ipv4_addresses())
				.should.eventually.have.length(1);
		});
	});

	describe('get_info()', () => {
		it('Returns config of container', () => {
			return container.get_info()
				.then(config => config.should.have.property('name'));
		});
	});

	describe('get_state()', () => {
		it('returns state of container', () => {
			return container.get_state()
				.then(state => state.status.should.equal('Running'));
		});
	});

	describe('exec()', () => {
		it('Executes command in container', function() {
			this.timeout(10000);

			return container.exec('hostname')
				.should.eventually.contain(config.container.name);
		});

		it('Rejects promise for bad command', () => {
			return container.exec('rm', ['/not/existing/directory'])
				.should.be.rejected;
		})
	});

	describe('patch()', () => {
		it('Updates container config', () => {
			return container
				.patch({ config: { 'environment.CONTAINER_NAME': config.container.name } })
				.should.eventually.have.property('config').that.has.property('environment.CONTAINER_NAME').that.equals(config.container.name);
		});
	});

	describe('mount()', () => {
		it('Mounts host path in container', () => {
			return container
				.mount(config.container.mount.source, config.container.mount.path, config.container.mount.name)
				.then(() => container.exec('ls', [config.container.mount.path]))
				.should.eventually.contain('lib');
		});
	});

	describe('unmount()', () => {
		it('Unmounts host path from container', () => {
			return container.unmount(config.container.mount.name)
				.then(() => container.exec('ls', [config.container.mount.path]))
				.should.eventually.have.length(0);
		})
	});

	describe('upload()', () => {
		it('Uploads a file to the container', () => {
			return container.upload(config.container.upload.source, config.container.upload.path)
				// Check if file is there and contains correct string
				.then(() => container.exec('cat', [config.container.upload.path]))
				.should.eventually.contain(fs.readFileSync(config.container.upload.source).toString().replace('\n', ''));
		})
	});

	describe('delete()', () => {
		it('Deletes container', function() {
			this.timeout(10000);

			return container.delete()
				.then(() => lxc.list())
				.should.eventually.be.a('Array').with.length(0);
		});
	});
});
