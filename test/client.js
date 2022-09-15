
import chai from 'chai';
chai.should();

import { Container } from '../src/index.js'
import { lxd, get_container } from './index.js'

describe('LXD Client', () => {
    describe('list()', () => {
        it('Responds with a array', async () => {
            let list = await lxd.list();
            list.should.be.a('array')
        });
    });

    describe('get_container()', () => {
        it('Returns container instance', () => {
            get_container().should.be.instanceOf(Container);
        });
    });
});

