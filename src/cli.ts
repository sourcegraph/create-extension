#!/usr/bin/env node
import 'source-map-support/register'

import chalk from 'chalk'
import exec from 'execa'
import GitUrlParse from 'git-url-parse'
import { exists, mkdir, readFile, writeFile } from 'mz/fs'
import { JSONSchemaForNPMPackageJsonFiles } from './package-schema'
import * as prompt from './prompt'
import { JSONSchemaForTheTypeScriptCompilerSConfigurationFile } from './tsconfig-schema'
import { JSONSchemaForESLintConfigurationFiles } from './eslintrc-schema'

interface Repository {
    type: string
    url: string
    directory?: string
}

async function getHttpsGitRemoteUrl(): Promise<string | undefined> {
    try {
        const gitUrl = GitUrlParse((await exec.shell('git remote get-url origin')).stdout)
        return `https://${gitUrl.resource}${gitUrl.pathname}`
    } catch (e) {
        return undefined
    }
}

async function main(): Promise<void> {
    console.log(['', 'Welcome to the Sourcegraph extension creator!', ''].join('\n'))

    const schema =
        'https://raw.githubusercontent.com/sourcegraph/sourcegraph/master/shared/src/schema/extension.schema.json'
    let name: string | undefined
    let repository: Repository | undefined
    let description: string | undefined
    let publisher: string | undefined
    let license: string | undefined

    try {
        ;({ name, description, publisher, repository, license } = JSON.parse(await readFile('package.json', 'utf-8')))
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err
        }
    }

    if (!(await exists('.git'))) {
        console.log('📘 .git directory not found, initializing git repository.\n')
        await exec('git', ['init'])
    }

    if (repository) {
        console.log(`Extension ${repository.type} repository url is "${repository.url}"`)
    } else {
        const url = await getHttpsGitRemoteUrl()

        if (url) {
            repository = {
                type: 'git',
                url,
            }
        } else {
            console.log(
                '📘  Unable to set the "repository" field in package.json as a git remote was not found. You should set this manually before publishing your extension.\n'
            )
        }
    }

    if (name) {
        console.log(`Extension name is "${name}"`)
    } else {
        name = await prompt.input({
            message: 'What should the name of the extension be (kebab-case)?',
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

    if (license) {
        console.log(`License is "${license}"`)
    } else {
        license = await prompt.choices({
            message: 'License?',
            choices: ['UNLICENSED', 'Apache-2.0'],
            default: 'Apache-2.0',
        })
    }

    if (await exists('tsconfig.json')) {
        console.log('📄 tsconfig.json already exists, skipping creation')
    } else {
        const tsconfigJson: JSONSchemaForTheTypeScriptCompilerSConfigurationFile = {
            extends: '@sourcegraph/tsconfig',
            compilerOptions: {
                target: 'ES2019',
                module: 'ESNext',
                moduleResolution: 'Node',
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

    if (await exists('.eslintrc.json')) {
        console.log('📄 .eslintrc.json already exists, skipping creation')
    } else {
        console.log('📄 Adding .eslintrc.json')
        const eslintJson: JSONSchemaForESLintConfigurationFiles = {
            extends: ['@sourcegraph/eslint-config'],
            parserOptions: {
                project: 'tsconfig.json',
            },
        }
        await writeFile('.eslintrc.json', JSON.stringify(eslintJson, null, 2))
    }

    if (await exists('prettier.config.js')) {
        console.log('prettier.config.js already exists, skipping creation')
    } else {
        console.log('📄 Adding prettier.config.js')
        await writeFile('prettier.config.js', "module.exports = require('@sourcegraph/prettierrc')")
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
        const packageJson: JSONSchemaForNPMPackageJsonFiles = {
            $schema: schema,
            name,
            description,
            publisher,
            activationEvents: ['*'],
            wip: true,
            categories: [],
            tags: [],
            contributes: {
                actions: [],
                menus: {
                    'editor/title': [],
                    commandPalette: [],
                },
                configuration: {},
            },
            version: '0.0.0-DEVELOPMENT',
            repository,
            license,
            main: `dist/${name}.js`,
            scripts: {
                eslint: "eslint 'src/**/*.ts'",
                typecheck: 'tsc -p tsconfig.json',
                build: `parcel build --out-file dist/${name}.js src/${name}.ts`,
                'symlink-package': 'mkdirp dist && lnfs ./package.json ./dist/package.json',
                serve: `yarn run symlink-package && parcel serve --no-hmr --out-file dist/${name}.js src/${name}.ts`,
                'watch:typecheck': 'tsc -p tsconfig.json -w',
                'watch:build': 'tsc -p tsconfig.dist.json -w',
                'sourcegraph:prepublish': 'yarn run typecheck && yarn run build',
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
                'export function activate(ctx: sourcegraph.ExtensionContext): void {',
                '    ctx.subscriptions.add(',
                "        sourcegraph.languages.registerHoverProvider(['*'], {",
                '            provideHover: () => ({',
                '                contents: {',
                `                    value: 'Hello world from ${name}! 🎉🎉🎉',`,
                '                    kind: sourcegraph.MarkupKind.Markdown',
                '                }',
                '            }),',
                '        })',
                '    )',
                '}',
                '',
                '// Sourcegraph extension documentation: https://docs.sourcegraph.com/extensions/authoring',
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
        'yarn',
        [
            'add',
            '--dev',
            'sourcegraph',
            'typescript',
            'parcel-bundler',
            'eslint',
            '@sourcegraph/eslint-config',
            '@sourcegraph/tsconfig',
            'lnfs-cli',
            'mkdirp',
        ],
        { stdio: 'inherit' }
    )

    if (await exists('README.md')) {
        console.log('📄 README.md already exists, skipping creation.')
    } else {
        console.log('📄 Adding README')
        const readme = [
            `# ${name} (Sourcegraph extension)`,
            '',
            description.endsWith('.') ? description : description + '.',
            '',
        ].join('\n')
        await writeFile('README.md', readme)
    }

    console.log(`⚠️  Remove ${chalk.bold('"wip": true')} from the package.json when this extension is ready for use.`)

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
