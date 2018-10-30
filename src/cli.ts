#!/usr/bin/env node
import 'source-map-support/register'

import chalk from 'chalk'
import exec = require('execa')
import { exists, mkdir, readFile, writeFile } from 'mz/fs'
import { JsonSchemaForNpmPackageJsonFiles } from './package-schema'
import * as prompt from './prompt'
import { JsonSchemaForTheTypeScriptCompilersConfigurationFile } from './tsconfig-schema'
import { JsonSchemaForTheTsLintConfigurationFiles } from './tslint-schema'

async function main(): Promise<void> {
    console.log(['', 'Welcome to the Sourcegraph extension creator!', ''].join('\n'))

    if (!(await exists('.git'))) {
        console.log('📘 .git directory not found, initilizing git repository')
        await exec('git', ['init'])
    }

    let name: string | undefined
    let title: string | undefined
    let description: string | undefined
    let publisher: string | undefined

    try {
        ;({ name, title, description, publisher } = JSON.parse(await readFile('package.json', 'utf-8')))
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err
        }
    }

    if (name) {
        console.log(`Extension name is "${name}"`)
    } else {
        name = await prompt.input({
            message: 'What should the name of the extension be (kebab-case)?',
        })
    }

    if (title) {
        console.log(`Extension title is "${title}"`)
    } else {
        title = await prompt.input({
            message: 'What should the title of the extension be (Sentence case)?',
        })
    }

    if (description) {
        console.log(`Description is "${description}"`)
    } else {
        description = await prompt.input({
            message: 'What does this extension do?',
        })
    }

    if (publisher) {
        console.log(`Publisher is "${publisher}"`)
    } else {
        publisher = await prompt.input({
            message: 'What is your Sourcegraph organization or username?',
            default: 'SOURCEGRAPH_ORG_OR_USERNAME',
        })
    }

    const licenseName = await prompt.choices({
        message: 'License?',
        choices: ['UNLICENSED', 'MIT'],
        default: 'MIT',
    })

    if (await exists('tsconfig.json')) {
        console.log('📄 tsconfig.json already exists, skipping creation')
    } else {
        const tsconfigJson: JsonSchemaForTheTypeScriptCompilersConfigurationFile = {
            extends: './node_modules/@sourcegraph/tsconfig/tsconfig.json',
            compilerOptions: {
                target: 'es2016',
                module: 'esnext',
                moduleResolution: 'node',
                sourceMap: true,
                declaration: true,
                outDir: 'dist',
                rootDir: 'src',
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
            },
        }
        console.log('📄 Adding tsconfig.json')
        await writeFile('tsconfig.json', JSON.stringify(tsconfigJson, null, 2))
    }

    if (await exists('tslint.json')) {
        console.log('📄 tslint.json already exists, skipping creation')
    } else {
        console.log('📄 Adding tslint.json')
        const tslintJson: JsonSchemaForTheTsLintConfigurationFiles = {
            extends: ['@sourcegraph/tslint-config'],
        }
        await writeFile('tslint.json', JSON.stringify(tslintJson, null, 2))
    }

    console.log('📄 Adding .editorconfig')
    await writeFile(
        '.editorconfig',
        [
            '[*]',
            'insert_final_newline = true',
            'end_of_line = lf',
            'charset = utf-8',
            'trim_trailing_whitespace = true',
            'indent_style = space',
            'indent_size = 4',
            '',
            '[*.{json,js,yml}]',
            'indent_size = 2',
            '',
            '[*.md]',
            'trim_trailing_whitespace = false',
            '',
        ].join('\n')
    )

    console.log('📄 Adding .gitignore')
    await writeFile('.gitignore', ['dist/', 'node_modules/', '.cache/', ''].join('\n'))

    if (await exists('package.json')) {
        console.log('📄 package.json already exists, skipping creation')
    } else {
        console.log('📄 Adding package.json')
        const packageJson: JsonSchemaForNpmPackageJsonFiles = {
            name,
            title,
            description,
            publisher,
            activationEvents: ['*'],
            contributes: {
                actions: [],
                menus: {
                    'editor/title': [],
                    commandPalette: [],
                },
                configuration: {},
            },
            version: '0.0.0-DEVELOPMENT',
            license: licenseName,
            main: `dist/${name}.js`,
            scripts: {
                tslint: "tslint -p tsconfig.json './src/**/*.ts'",
                typecheck: 'tsc -p tsconfig.json',
                build: `parcel build --out-file dist/${name}.js src/${name}.ts`,
                serve: `parcel serve --no-hmr --out-file dist/${name}.js src/${name}.ts`,
                'watch:typecheck': 'tsc -p tsconfig.json -w',
                'watch:build': 'tsc -p tsconfig.dist.json -w',
                'sourcegraph:prepublish': 'npm run build',
            },
            browserslist: [
                'last 1 Chrome versions',
                'last 1 Firefox versions',
                'last 1 Edge versions',
                'last 1 Safari versions',
            ],
        }
        await writeFile('package.json', JSON.stringify(packageJson, null, 2))
    }

    try {
        console.log('📂 Creating src directory')
        await mkdir('src')
        await writeFile(
            `src/${name}.ts`,
            [
                "import * as sourcegraph from 'sourcegraph'",
                '',
                'export function activate(): void {',
                "   sourcegraph.languages.registerHoverProvider(['*'], {",
                `       provideHover: () => ({ contents: { value: 'Hello world from ${title}! 🎉🎉🎉' } })`,
                '   })',
                '}',
                '',
                '// Learn what else is possible by visiting the [Sourcegraph extension documentation](https://github.com/sourcegraph/sourcegraph-extension-docs)',
                '',
            ].join('\n')
        )
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err
        }
    }

    console.log('📦 Installing dependencies')
    await exec(
        'npm',
        [
            'install',
            '--save-dev',
            'sourcegraph',
            'typescript',
            'parcel-bundler',
            'tslint',
            '@sourcegraph/tslint-config',
            '@sourcegraph/tsconfig',
        ],
        { stdio: 'inherit' }
    )

    if (await exists('README.md')) {
        console.log('📄 README.md already exists, skipping creation.')
    } else {
        console.log('📄 Adding README')
        const readme = [
            `# ${title}`,
            '',
            description[description.length - 1] === '.' ? description : description + '.',
            '',
            '## Prerequisites',
            '',
            'Sourcegraph extensions are written in TypeScript and are distributed as bundled JavaScript files that run on the client. For creation, publishing, and viewing, you need:',
            '',
            '- **Creation**: Install [Node.js](https://nodejs.org).',
            '- **Publishing**: Install the [Sourcegraph CLI (`src`)](https://github.com/sourcegraph/src-cli#installation) and create a [Sourcegraph.com account](https://sourcegraph.com/sign-up).',
            '- **Viewing**: Install the Sourcegraph extension for [Chrome](https://chrome.google.com/webstore/detail/sourcegraph/dgjhfomjieaadpoljlnidmbgkdffpack) or [Firefox](https://addons.mozilla.org/en-US/firefox/addon/sourcegraph/).',
            '',
            '## Set up',
            '',
            '```',
            `npm install`,
            '```',
            '',
            '## Lint and type check',
            '',
            '```',
            `npm run tslint`,
            `npm run typecheck`,
            '```',
            '',
            '## Publish',
            '',
            '```',
            'src extensions publish',
            '```',
            '',
            '## Sourcegraph extension API',
            '',
            'Visit the [Sourcegraph extension documentation](https://github.com/sourcegraph/sourcegraph-extension-docs) and check out some [Sourcegraph extension samples](https://github.com/sourcegraph/sourcegraph-extension-samples).',
            '',
        ].join('\n')
        await writeFile('README.md', readme)
    }

    setTimeout(() => process.exit(0), 100)
}

main().catch(err => {
    if (err.showStack === false) {
        console.error('\n' + chalk.red(err.message) + '\n')
    } else {
        console.error(err)
    }
    setTimeout(() => process.exit(1), 100)
})
