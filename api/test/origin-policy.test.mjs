import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins } from '../dist/origin-policy.js';
test('development accepts the configured tunnel and explicit local frontend addresses',()=>{
  const origins=allowedOrigins('https://example.trycloudflare.com','development');
  for(const origin of ['https://example.trycloudflare.com','http://localhost:5173','http://127.0.0.1:5173']) assert(origins.has(origin));
  for(const origin of ['https://other.trycloudflare.com','http://evil.example','http://localhost:9999','null']) assert(!origins.has(origin));
});
test('production only accepts its explicitly configured frontend',()=>{
  assert.deepEqual([...allowedOrigins('https://store.example/','production')],['https://store.example']);
});
