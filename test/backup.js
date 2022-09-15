
import {
    clean_volume,
    create_volume,
} from './index.js'

describe('Backup', () => {
    afterEach(clean_volume)

    describe('create()', () => {
        it('Creates backup', async () => {
            let volume = await create_volume()
            let backup = await volume.get_backup('back').create()

            let list = await volume.list_backups();
            list.should.contain('back');
            backup.name.should.equal('back');

            await volume.destroy()
        });
    });

    describe('download()', () => {
        it('download backup');
    });

    describe('destroy()', () => {
        it('Destroys backup', async () => {
            let name = 'back'
            let volume = await create_volume()
            let backup = await volume.get_backup(name).create()

            await backup.destroy()

            let list = await volume.list_backups();
            list.should.not.contain(name);

            await volume.destroy()
        });
    });
})
