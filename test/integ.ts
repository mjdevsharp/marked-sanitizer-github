import { join } from 'path';
import { readFileSync } from 'fs';
import test from 'ava';
import sinon = require('sinon');
import marked = require('marked');
import here from 'heredocument';
import SanitizeState from '../index';

const CHECK_INTEG = {
    'small input without tag': {
        input: here`
            Title
            =====

            - hello
              - world
        `,
        output: here`
            <h1 id="title">Title</h1>
            <ul>
            <li>hello<ul>
            <li>world</li>
            </ul>
            </li>
            </ul>
        `,
    },
    'allowed tags': {
        input: here`
            <div>
                <a href="https://example.com">hello</a>
            </div>
        `,
        output: here`
            <p><div>
                <a href="https://example.com">hello</a>
            </div>
            </p>
        `,
    },
    'banned tags': {
        input: here`
            <style>
            </style>
            <script>
            </script>
        `,
        output: here`
            <p>&lt;style&gt;
            &lt;/style&gt;</p>
            <p>&lt;script&gt;
            &lt;/script&gt;
            </p>
        `,
    },
    'moreved tags': {
        input: here`
            <li>foo</li>
            <thead>bar</thead>
            <td>baz</td>
        `,
        output: here`
            <p>foo</p>
            <p>bar</p>
            <p>baz
            </p>
        `,
    },
} as {
    [desc: string]: {
        input: string;
        output: string;
    };
};

for (const desc of Object.keys(CHECK_INTEG)) {
    const testcase = CHECK_INTEG[desc];
    test(`sanitizes ${desc}`, t => {
        const state = new SanitizeState();
        const have = marked(testcase.input, {
            sanitize: true,
            sanitizer: state.getSanitizer(),
        });
        const want = testcase.output;
        t.is(want, have);
        t.false(state.isBroken());
        t.false(state.isInUse());
    });
}

test('as real-world-example, README.md for markedjs/marked can be sanitized', t => {
    const readme = readFileSync(join(__dirname, 'marked-README.md'), 'utf8');
    const state = new SanitizeState();
    const spy = sinon.spy();
    state.onDetectedBroken = spy;
    // TODO: Check the converted result does not contain &lt; and &gt;
    marked(readme, {
        sanitize: true,
        sanitizer: state.getSanitizer(),
    });
    t.is(spy.getCall(0), null);
    t.false(state.isBroken());
    t.false(state.isInUse());
});
