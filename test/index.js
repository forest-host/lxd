
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

import chai from 'chai';
chai.should();

import { LXD, Container, Volume, Snapshot } from '../src/index.js';

// Util functions
export const lxd = new LXD({ key: '.keys/tests.key', cert: '.keys/tests.crt', port: '8443', host: '127.0.0.1' });

export const get_container = (name = 'testing', image = 'testing', profile = 'testing') => lxd
    .get_container(name)
    .from_image(image)
    .set_profile(profile)

export const create_container = () => get_container().create({ wait: true })
export const start_container = () => create_container().then(container => container.start())

export const get_pool = (name = 'default') => lxd.get_pool(name)
export const get_volume = (name = 'volume') => get_pool().get_volume(name)
export const create_volume = () => get_volume().create()

export const clean_container = async function() {
    if(this.currentTest.state == 'failed') {
        try {
            await get_container(...arguments).force_destroy()
        } catch(_) {}
    }
}

export const clean_volume = async function() {
    if(this.currentTest.state == 'failed') {
        try {
            await get_volume(...arguments).destroy()
        } catch(_) {}
    }
}

