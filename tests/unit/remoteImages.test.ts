import { describe, expect, it } from 'vitest'
import { countRemoteImages, remoteHost } from '../../src/lib/remoteImages'

describe('remoteImages (Load images from the web)', () => {
  it('finds the host the browser would fetch, however the address is spelled', () => {
    for (const src of [
      'https://tracker.example/p.png',
      'HTTPS://tracker.example/p.png',
      'http://tracker.example/p.png',
      '//tracker.example/p.png',
      'https:tracker.example/p.png',
      'https:/tracker.example/p.png',
      'https:\\\\tracker.example/p.png',
      '\\\\tracker.example/p.png',
      '/\\tracker.example/p.png',
      ' https://tracker.example/p.png ',
    ])
      expect(remoteHost(src), src).toBe('tracker.example')
  })

  it('leaves local images alone', () => {
    for (const src of [undefined, '', 'img/a.png', './a.png', '/a.png', '#x', 'data:image/png;base64,AAAA', 'blob:abc', `${window.location.origin}/a.png`])
      expect(remoteHost(src), String(src)).toBeNull()
  })

  it('counts every form the preview blocks, inline and by reference, outside code', () => {
    const doc = [
      '![a](https://a.example/p.png)',
      '![b](https:b.example/p.png) ![c](https:/c.example/p.png)',
      '![d](https\\://d.example/p.png)',
      '![not remote](\\\\\\\\x.example/p.png)',
      '![e][e]',
      '[e]: https:e.example/p.png',
      '![local](img/a.png)',
      '```',
      '![code](https:f.example/p.png)',
      '```',
    ].join('\n')
    expect(countRemoteImages(doc)).toBe(5)
  })
})
