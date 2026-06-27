import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPreviewDocument,
  fileUrlFromPath,
  getPreviewFrameSource,
  summarizeShowWidget,
  summarizeBrowseWidgets,
} from './index.mjs'

test('buildPreviewDocument wraps SVG with preview shell and glimpse bridge', () => {
  const doc = buildPreviewDocument('<svg viewBox="0 0 10 10"></svg>', true)
  assert.match(doc, /<!doctype html>/i)
  assert.match(doc, /window\.glimpse/)
  assert.match(doc, /<svg viewBox="0 0 10 10"><\/svg>/)
})

test('fileUrlFromPath creates encoded local file urls', () => {
  assert.equal(
    fileUrlFromPath('/Users/me/.pi/widgets/test file.html'),
    'file:///Users/me/.pi/widgets/test%20file.html',
  )
})

test('getPreviewFrameSource avoids direct local file urls and honors result height', () => {
  const source = getPreviewFrameSource({ widget_code: '<div>Fallback</div>', height: 300 }, {
    fullPath: '/Users/me/.pi/widgets/demo.html',
    height: 640,
    isSVG: false,
  })

  assert.equal(source.src, undefined)
  assert.match(source.srcDoc, /<div>Fallback<\/div>/)
  assert.equal(source.height, 640)
})

test('summarizeShowWidget extracts metadata from args and details', () => {
  const summary = summarizeShowWidget({
    title: 'demo_widget',
    width: 640,
    height: 360,
    widget_code: '<div>Hello</div>',
    interactive: true,
  }, {
    title: 'demo_widget',
    width: 640,
    height: 360,
    isSVG: false,
    savedFile: '2026_demo_widget.html',
    fullPath: '/tmp/2026_demo_widget.html',
  })

  assert.equal(summary.title, 'demo widget')
  assert.equal(summary.sizeLabel, '640×360')
  assert.equal(summary.kindLabel, 'HTML')
  assert.equal(summary.interactive, true)
  assert.equal(summary.savedFile, '2026_demo_widget.html')
})

test('summarizeBrowseWidgets normalizes list action widgets', () => {
  const summary = summarizeBrowseWidgets({ action: 'list' }, {
    widgets: [
      {
        title: 'Alpha',
        timestamp: '2026-05-26_10-00-00',
        width: 800,
        height: 600,
        file: 'alpha.html',
        isSVG: true,
      },
    ],
  }, '')

  assert.equal(summary.action, 'list')
  assert.equal(summary.widgets.length, 1)
  assert.equal(summary.widgets[0].title, 'Alpha')
  assert.equal(summary.widgets[0].sizeLabel, '800×600')
  assert.equal(summary.widgets[0].kindLabel, 'SVG')
})
