import os, sys

def get_output():
    for i in range(len(sys.argv)):
        if sys.argv[i] == '-o':
            return sys.argv[i+1]
    return None

def run(compiler):
    # for NODERAWFS, which fully exposes our local filesystem, see:
    #    https://github.com/emscripten-core/emscripten/blob/b53550319d1bc02a3f3571bdd069ed6abf03377b/src/settings.js#L871
    c = compiler + ' ' + ' '.join(['"%s"'%x if ' ' in x else x for x in sys.argv[1:]]) + ' -s NODERAWFS=1'
    print(c)
    if os.system(c):
        raise RuntimeError
    output = get_output()
    if not output:
        return
    content = open(output,'r').read()
    open(output,'w').write("#!/usr/bin/env node\n\n" + content)
    if os.system("chmod +x " + output):
        raise RuntimeError