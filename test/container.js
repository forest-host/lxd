
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
} from './'

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
            list.should.contain(container.name());

            return container.destroy()
        });
    })

    describe('set_state()', () => {
        it('Changes container state', async function() {
            this.timeout(10000)
            let container = await create_container()
            await container.set_state('start');

            let state = await container.get_state();
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
            container.config.devices.volume.pool.should.equal(volume.pool.name());
            container.config.devices.volume.source.should.equal(volume.name());
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
            container.config.devices.test.source.should.equal(volume.name());

            await container.destroy()
            await volume.destroy()
        });
    })

    /*
    describe('exec()', () => {
        it('Executes command in container', async () => {
            let multiline = fs.readFileSync('./test/test.key').toString()
            let container = await get_container()
                .set_environment_variable('TREE_HOST', 'Birch')
                .set_environment_variable('MULTILINE', multiline)
                .create()
            await container.start()

            ({ stdout } = await container.exec('hostname'))
            stdout[0].should.contain(container.name())

            ({ stdout } = await container.exec('pwd'))
            stdout[0].should.equal('/root')

            let cwd = '/etc';
            ({ stdout } = await container.exec('pwd', { cwd }))
            stdout[0].should.equal(cwd);

            // We'll have to execute in shell to echo env variables
            ({ stdout } = await container.exec('echo', ['$TREE_HOST'], { shell: true }))
            stdout[0].should.equal('Birch');

            ({ stdout } = await container.exec('echo', ['$MULTILINE'], { shell: true }))
            stdout[0].should.equal(multiline);

            // Timeout is in millis
            ({ status, stdout } = await container.exec('sleep', ['300'], { timeout: 100 }))
            stdout.should.have.length(0);
            status.should.be.above(0);

            let sockets = await container.exec('echo', ['test'], { interactive: true })
            let messages = [];

            sockets.should.have.property('control');
            sockets.should.have.property('0');

            // See if output matches
            sockets['1'].on('message', data => {
                var string = data.toString('utf8').trim();

                // Push strings onto output array, seperated by newline, use apply so we can pass split string as arguments to push
                if(string) {
                    messages.push.apply(messages, string.split('\n'));
                }
            });

            await new Promise(resolve => {
                // When control closes, run tests
                sockets.control.on('close', () => {
                    // When control closes, we need to close the stdin/stdout socket
                    ['0', '1', '2'].forEach(key => sockets[key].close());
                    messages.map(m => m.toString().should.contain('test'))
                    resolve();
                });
            })

            let { status } = await container.exec('rm', ['/not/existing/directory'])
            status.should.equal(1);

            await container.force_destroy()
        });
    });
    */

    describe('upload_string()', () => {
        it('Uploads a string to a file in container', async () => {
            let string = 'hey there'
            let path = '/uploaded.txt'
            let container = await start_container()
            await container.upload_string(string, path)

            let { stdout } = await container.exec('cat', [path]);
            stdout.should.contain(string);

            await container.force_destroy()
        })
    });

    describe('upload()', () => {
        it('Streams readable stream to container', async () => {
            let file = 'test/test.key'
            let path = '/uploaded.key'

            let container = await start_container()
            await container.upload(fs.createReadStream(file), path)
            let { size } = await fs.promises.stat(file);
            let { stdout } = await container.exec('stat', ['-c', '%s', path]);
            stdout[0].should.contain(size);

            await container.force_destroy()
        });
    })

    describe('download()', done => {
        it('Downloads a file from container', async () => {
            let container = await start_container()
            let contents = await container.download('/etc/hosts')
            contents.should.contain(container.name())

            await assert.isRejected(container.download('/non_existant_file'))

            await container.force_destroy()
        });
    })

    describe('destroy()', () => {
        it('does not delete running container', async function() {
            this.timeout(30000);
            let container = await start_container()
        
            await assert.isRejected(container.destroy())

            await container.stop(true);
            await container.destroy()

            let list = await lxd.list();
            list.should.not.contain(container.name())
        });
    });
});
