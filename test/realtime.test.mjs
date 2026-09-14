import test from 'node:test'
import assert from 'node:assert/strict'
import { addRealtimeClient, publishRealtime, realtimeClientCount } from '../lib/realtime.mjs'

test('eventos em tempo real chegam às conexões ativas e são removidos ao fechar',()=>{const chunks=[],response={write:value=>chunks.push(value)},remove=addRealtimeClient('user-test',response);assert.equal(realtimeClientCount(),1);publishRealtime('messages',{action:'send'});assert.match(chunks.join(''),/event: messages/);assert.match(chunks.join(''),/"action":"send"/);remove();assert.equal(realtimeClientCount(),0)})
