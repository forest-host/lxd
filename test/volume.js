
import chai from 'chai';
chai.should();

import { Snapshot } from '../src'
import { 
    clean_volume,
    clean_container,
    get_pool,
    get_volume,
    create_volume,
    get_container,
} from './'

describe('Volume', () => {
    afterEach(clean_volume)

    describe('create()', () => {
        it('Creates new storage volume', async () => {
            let volume = await create_volume()
            let list = await get_pool().list();
            list.should.contain(volume.name);
            await volume.destroy()
        })
    })

    describe('clone_from()', () => {
        afterEach(function() { 
            return clean_volume.apply(this, ['clone']) 
                .then(() => clean_container.apply(this))
        })

        it('clones volume from other volume', async function() {
            this.timeout(30000);

            let string = 'this is a string\n';
            let mount = { path: '/test', name: 'volume' };
            let path = '/test/test.txt';

            let volume = await create_volume()
            // Create container that has volume mounted & upload something to volume so we can test cloning
            let container = await get_container().mount(volume, mount.path, mount.name).create();
            await container.start()
            await container.upload_string(string, path);
            await container.force_destroy()

            // Create a clone & remove original
            let clone = await get_volume('clone').clone_from({ source: volume })
            await volume.destroy();

            // Mount clone to fetch file
            container = await get_container().mount(clone, mount.path, mount.name).create();
            await container.start()
            let download = await container.download(path);
            download.should.equal(string);

            await container.force_destroy()
            await clone.destroy();
        })
    })

    describe('load()', () => {
        it('Loads volume config', async () => {
            let volume = await get_volume('name').create()
            volume.unload();
            await volume.load();

            volume.name.should.equal('name');

            await volume.destroy()
        })
    })

    describe('destroy()', () => {
        it('Destroys volume', async () => {
            let volume = await get_volume().create()
            await volume.destroy()
            let list = await get_pool().list();

            list.should.not.contain(volume.name);
        });
    })

    describe('get_snapshot()', () => {
        it('Returns snapshot representation', () => {
            let volume = get_volume();
            let snapshot = volume.get_snapshot('snap');
            snapshot.should.be.instanceOf(Snapshot);
        })
    })
})
