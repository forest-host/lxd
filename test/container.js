
import chai from 'chai';
import cap from 'chai-as-promised'
chai.use(cap)
const assert = chai.assert
chai.should();

import fs from 'fs';

import { 
    clean_container,
    clean_volume,
    lxd,
    get_container,
    create_container,
    start_container,
    get_volume,
    create_volume,
} from './index.js'

describe('Container', () => {
    afterEach(clean_container)

    describe('from_image()', () => {
        it('Sets image source with alias', () => {
            let container = lxd.get_container('test').from_image('testing')
            container.config.source.alias.should.not.be.undefined;
        })
    });

    describe('on_target()', () => {
        it('Sets up container on specific host in LXD cluster', () => {
            let container = lxd.get_container('test').on_target('testing')
            container.target.should.not.be.undefined;
        });
    })

    describe('create()', () => {
        it('Creates container', async () => {
            let container = await create_container()

            let list = await lxd.list()
            list.should.contain(container.name);

            return container.destroy()
        });
    })

    describe('set_state()', () => {
        it('Changes container state', async function() {
            this.timeout(10000)
            let container = await create_container()

            let state = await container.get_state();
            state.should.have.property('status').that.equals('Stopped');

            await container.set_state({ action: 'start' });

            state = await container.get_state();
            state.should.have.property('status').that.equals('Running');

            await container.force_destroy()
        })
    })

    describe('wait_for_dhcp_lease()', () => {
        it('Waits for dhcp lease', async function() {
            this.timeout(10000);

            let container = await start_container()
            await container.wait_for_dhcp_lease()
            let addresses = await container.get_ipv4_addresses();
            addresses.should.have.length(1);

            await container.force_destroy()
        });
    });

    describe('mount()', () => {
        it('Adds LXD volume config to local container config', () => {
            let container = get_container()
            let volume = get_volume()
            container.mount(volume, '/test_volume', 'volume');
            container.config.devices.volume.pool.should.equal(volume.pool.name);
            container.config.devices.volume.source.should.equal(volume.name);
        });
    })

    describe('set_environment_variable()', () => {
        it('Adds environment variable to local config', () => {
            let container = get_container()
            container.set_environment_variable('TREE_HOST', 'Birch');
            container.config.config['environment.TREE_HOST'].should.equal('Birch');
        });

    })

    describe('update()', () => {
        afterEach(clean_volume)

        it('Updates config of container in LXD with local config', async () => {
            let [volume, container] = await Promise.all([create_volume(), create_container()])

            await container
                .mount(volume, '/test', 'test')
                .set_environment_variable('TREE_HOST', 'Birch')
                .update();

            container.config.config['environment.TREE_HOST'].should.equal('Birch');
            container.config.devices.test.source.should.equal(volume.name);

            await container.destroy()
            await volume.destroy()
        });
    })

    describe('exec()', () => {
        it('Executes command in container', async function() {
            this.timeout(30000)
            let container = await get_container()
                .set_environment_variable('TREE_HOST', 'Birch')
                .create()
            await container.start()

            let result = await container.exec({ command: ['hostname'] })
            result.stdout.should.contain(container.name);

            result = await container.exec({ command: ['pwd'] })
            result.stdout.should.equal('/root\n')

            result = await container.exec({ command: ['pwd'], cwd: '/etc' })
            result.stdout.should.equal('/etc\n');

            // We'll have to execute in shell to echo env variables
            result  = await container.exec({ command: ['sh', '-c', 'echo $TREE_HOST'] })
            result.stdout.should.equal('Birch\n');

            result = await container.exec({ command: ['rm', '/not/existing/directory'] })
            result.return.should.equal(1);

            await container.force_destroy()
        });
    });

    describe('upload_string()', () => {
        it('Uploads a string to a file in container', async function() {
            this.timeout(20000)
            let string = 'hey there'
            let path = '/uploaded.txt'
            let container = await start_container()
            await container.upload_string(string, path)

            let { stdout } = await container.exec({ command: ['cat', path] });
            stdout.should.contain(string);

            await container.force_destroy()
        })
    });

    describe('download_string()', done => {
        it('Downloads a file from container', async function() {
            this.timeout(20000)
            let container = await start_container()
            let contents = await container.download('/etc/hosts')
            contents.should.contain(container.name)

            await assert.isRejected(container.download('/non_existant_file'))

            await container.force_destroy()
        });
    })

    /*
    describe('upload()', () => {
        it('Streams readable stream to container', async () => {
            let file = 'test/test.key'
            let path = '/uploaded.key'

            let container = await start_container()
            await container.upload(fs.createReadStream(file), path)
            let { size } = await fs.promises.stat(file);
            let { stdout } = await container.exec({ command: ['stat', '-c', '%s', path] });
            stdout.should.contain(size);

            await container.force_destroy()
        });
    })
    */

    describe('destroy()', () => {
        it('does not delete running container', async function() {
            this.timeout(30000);
            let container = await start_container()

            await assert.isRejected(container.destroy())

            await container.stop(true);
            await container.destroy()

            let list = await lxd.list();
            list.should.not.contain(container.name)
        });
    });
});
