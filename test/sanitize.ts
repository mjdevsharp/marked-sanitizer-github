import test, { GenericTestContext, Context } from 'ava';
import { escape } from 'he';
import SanitizeState from '../index';

interface ElemTest {
    elem: string | [string, { [name: string]: string }];
    escaped: boolean;
    children?: ElemTest | ElemTest[];
}

const SANITIZE_OK: {
    [desc: string]: ElemTest[];
} = {
    'allowed elements and attributes only (sequential)': [
        { elem: 'div', escaped: false },
        { elem: ['a', { name: 'hello' }], escaped: false },
        { elem: ['a', { href: 'https://example.com' }], escaped: false },
        { elem: ['a', { href: 'foo/bar.html' }], escaped: false },
    ],

    'allowed elements and attributes only (nested)': [
        {
            elem: 'div',
            escaped: false,
            children: {
                elem: ['a', { name: 'hello' }],
                escaped: false,
                children: { elem: ['a', { href: 'https://example.com' }], escaped: false },
            },
        },
    ],

    'sanitized elements only (sequential)': [
        { elem: 'style', escaped: true },
        { elem: ['script', { src: 'https://example.com/foo.js' }], escaped: true },
        { elem: ['a', { onclick: 'console.log("hey")' }], escaped: true },
    ],

    'sanitized elements only (nested)': [
        {
            elem: 'style',
            escaped: true,
            children: {
                elem: ['script', { src: 'https://example.com/foo.js' }],
                escaped: true,
                children: { elem: ['a', { onclick: 'console.log("hey")' }], escaped: true },
            },
        },
    ],

    'sanitize attributes': [
        { elem: ['a', { onclick: 'console.log("hey")' }], escaped: true },
        { elem: ['a', { href: 'https://example.com' }], escaped: false },
        { elem: ['a', { href: 'https://example.com', onclick: '42' }], escaped: true },
        { elem: ['a', { name: 'foo' }], escaped: false },
        { elem: ['img', { onclick: 'console.log("hey")' }], escaped: true },
        { elem: ['img', { src: 'path/to/image.png' }], escaped: false },
        { elem: ['div', { onclick: 'console.log("hey")' }], escaped: true },
        { elem: ['div', { color: 'red' }], escaped: false },
        { elem: ['div', { color: 'red', onclick: '42' }], escaped: true },
    ],

    'sanitize protocols': [
        { elem: ['a', { href: 'https://foo.com/bar' }], escaped: false },
        { elem: ['a', { href: 'https://foo.com' }], escaped: false },
        { elem: ['a', { href: 'http://foo.com/bar' }], escaped: false },
        { elem: ['a', { href: 'mailto:rhysd@github.com' }], escaped: false },
        { elem: ['a', { href: 'file:///path/to/file' }], escaped: true },
        { elem: ['a', { href: 'relateive/path' }], escaped: false },
        { elem: ['a', { href: '/absolute/path' }], escaped: true },
        { elem: ['img', { src: 'http://example.com' }], escaped: false },
        { elem: ['img', { src: 'https://example.com' }], escaped: false },
        { elem: ['img', { longdesc: 'http://example.com' }], escaped: false },
        { elem: ['img', { longdesc: 'https://example.com' }], escaped: false },
        { elem: ['img', { src: 'http://example.com', longdesc: 'https://example.com' }], escaped: false },
        { elem: ['img', { src: 'file:///foo/bar', longdesc: 'https://example.com' }], escaped: true },
        { elem: ['img', { src: '/abs/path', longdesc: 'https://example.com' }], escaped: true },
        { elem: ['blockquote', { cite: 'https://example.com' }], escaped: false },
    ],
};

function test_escape_element(t: GenericTestContext<Context<any>>, state: SanitizeState, testcase: ElemTest): void {
    const { elem, escaped } = testcase;

    {
        let input;
        if (typeof elem === 'string') {
            input = `<${elem}>`;
        } else {
            const attrs = Object.keys(elem[1])
                .map(key => `${key}="${elem[1][key]}"`)
                .join(' ');
            input = `<${elem[0]} ${attrs}>`;
        }
        let want = input;
        if (escaped) {
            want = escape(want);
        }
        const have = state.sanitize(input);
        t.is(want, have);
    }

    if (testcase.children !== undefined) {
        const children = Array.isArray(testcase.children) ? testcase.children : [testcase.children];
        for (const child of children) {
            test_escape_element(t, state, child);
        }
    }

    {
        const input = `</${typeof elem === 'string' ? elem : elem[0]}>`;
        let want = input;
        if (escaped) {
            want = escape(want);
        }
        const have = state.sanitize(input);
        t.is(want, have);
    }
}

for (const desc of Object.keys(SANITIZE_OK)) {
    const tags = SANITIZE_OK[desc];
    test(desc, t => {
        const state = new SanitizeState();
        for (const tag of tags) {
            test_escape_element(t, state, tag);
        }
        t.false(state.isInUse());
    });
}

test('sanitize allowed empty elements', t => {
    for (const tc of [['<br/>'], ['<br/>', '<br/>', '<br/>'], ['<div>', '<br/>', '</div>']]) {
        const state = new SanitizeState();
        for (const tag of tc) {
            const ret = state.sanitize(tag);
            t.is(tag, ret);
        }
        t.false(state.isInUse());
    }
});

test('sanitize banned empty elements', t => {
    for (const tc of [['<style/>'], ['<style/>', '<style/>', '<style/>'], ['<div>', '<style/>', '</div>']]) {
        const state = new SanitizeState();
        for (const tag of tc) {
            const have = state.sanitize(tag);
            let want = tag;
            if (tag !== '<div>' && tag !== '</div>') {
                want = escape(tag);
            }
            t.is(want, have);
        }
        t.false(state.isInUse());
    }
});

const TEST_REMOVE_OK = {
    'remove list item element if list element is not in ancestors': {
        input: [['<li>', '</li>'], ['<li/>']],
        parent: ['ul', 'ol'],
    },
    'remove table-related element if <table> is not in ancestors': {
        input: [
            ['<tr>', '</tr>'],
            ['<tr/>'],
            ['<th>', '</th>'],
            ['<td>', '</td>'],
            ['<thead>', '</thead>'],
            ['<tbody>', '</tbody>'],
            ['<tfoot>', '</tfoot>'],
        ],
        parent: ['table'],
    },
} as { [desc: string]: { input: string[][]; parent: string[] } };

for (const desc of Object.keys(TEST_REMOVE_OK)) {
    test(desc, t => {
        const testcases = TEST_REMOVE_OK[desc].input;
        for (const tc of testcases) {
            const state = new SanitizeState();
            for (const tag of tc) {
                const have = state.sanitize(tag);
                t.is('', have);
            }
            t.false(state.isInUse());
        }
        for (const list of TEST_REMOVE_OK[desc].parent) {
            for (const tc of testcases) {
                const state = new SanitizeState();
                state.sanitize(`<${list}>`);
                for (const tag of tc) {
                    const have = state.sanitize(tag);
                    t.is(tag, have);
                }
                state.sanitize(`</${list}>`);
                t.false(state.isInUse());
            }
        }
    });
}
