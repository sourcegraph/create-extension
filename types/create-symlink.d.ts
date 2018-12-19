declare module 'create-symlink' {
    const createSymlink:  (from: string, to: string) => Promise<void>
    export = createSymlink
}
