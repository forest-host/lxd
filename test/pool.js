
import chai from 'chai';
chai.should();

import { Volume } from '../src'
import { clean, get_pool } from './'

describe('Pool', () => {
    afterEach(clean)

    describe('list()', () => {
        it('Lists custom storage volumes in pool', async () => {
            const list = await get_pool().list()
            list.should.be.a('Array')
        });
    });

    describe('get_volume()', () => {
        it('Returns volume representation', () => {
            get_pool().get_volume('test').should.be.instanceOf(Volume);
        })
    })
});
