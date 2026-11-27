#!/usr/bin/env python3
"""Acrescenta o módulo à imagem vigente, com teste isolado, lease e reversão."""
import argparse, fcntl, json, os, re, shlex, subprocess, tarfile, time, urllib.request
from pathlib import Path

SERVICE = 'doctor-creator-hub'
BASE = Path('/opt/doctor-creator-hub-publicacoes')

def run(args, **kw):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kw).stdout.strip()

def spec():
    return json.loads(run(['docker', 'service', 'inspect', SERVICE]))[0]

def image(s):
    return s['Spec']['TaskTemplate']['ContainerSpec']['Image'].split('@')[0]

def container(service):
    ids = run(['docker', 'ps', '--filter', 'label=com.docker.swarm.service.name=' + service, '--format', '{{.ID}}']).splitlines()
    return ids[0] if ids else None

def http(url):
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.status, response.read().decode('utf8')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    parser.add_argument('--expected-image', required=True)
    parser.add_argument('--mode', choices=['prepare', 'publish'], required=True)
    args = parser.parse_args()
    if not re.fullmatch('[a-f0-9]{40}', args.commit): raise RuntimeError('Commit inválido')
    BASE.mkdir(parents=True, exist_ok=True)
    lock = open('/var/lock/doctor-creator-hub-publicar.lock', 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    current = spec()
    if image(current) != args.expected_image: raise RuntimeError('A imagem ativa mudou. Reavaliar antes de publicar.')
    task = BASE / ('acompanhamento-' + args.commit[:12])
    task.mkdir(mode=0o700, exist_ok=True)
    os.chmod(task, 0o700)
    metadata = task / 'publicacao.json'
    tag = 'doctor-creator-hub:acompanhamento-' + args.commit[:12]
    if args.mode == 'prepare':
        cid = container(SERVICE)
        if not cid: raise RuntimeError('Contêiner atual não encontrado')
        old_html = run(['docker', 'exec', cid, 'cat', '/app/dist/index.html'])
        scripts = re.findall(r'(?:src|href)=["\'](/assets/index-[^"\']+\.js)["\']', old_html)
        if not scripts: raise RuntimeError('Pacote original não identificado')
        scan = r"""const fs=require('node:fs');let text='';for(const f of fs.readdirSync('/app/dist/assets')){if(f.endsWith('.js'))text+=fs.readFileSync('/app/dist/assets/'+f,'utf8')+'\n';}const keys=new Set(text.match(/sb_publishable_[A-Za-z0-9_-]{10,}/g)||[]);if(!keys.size){for(const token of text.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){try{const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());if(claims.role==='anon')keys.add(token);}catch{}}}console.log(JSON.stringify({keys:[...keys],urls:[...new Set(text.match(/https:\/\/[a-z0-9]+\.supabase\.co/g)||[])]}));"""
        config = json.loads(run(['docker', 'exec', cid, 'node', '-e', scan]))
        keys, urls = set(config['keys']), set(config['urls'])
        if len(keys) != 1 or len(urls) != 1: raise RuntimeError('Configuração pública ambígua: ' + str(len(keys)) + ' chaves e ' + str(len(urls)) + ' projetos. Nada publicado.')
        url = next(iter(urls))
        if url != 'https://cvdnzoqduliopscfsrkc.supabase.co': raise RuntimeError('Projeto de dados diferente do esperado')
        archive = task / 'codigo.tar.gz'
        urllib.request.urlretrieve('https://codeload.github.com/douglasgomides/dashboard/tar.gz/' + args.commit, archive)
        source = task / 'fonte'
        source.mkdir(exist_ok=True)
        with tarfile.open(archive) as tar: tar.extractall(source, filter='data')
        roots = [p for p in source.iterdir() if p.is_dir()]
        if len(roots) != 1: raise RuntimeError('Estrutura do pacote inválida')
        env = dict(os.environ, VITE_SUPABASE_URL=url, VITE_SUPABASE_PUBLISHABLE_KEY=next(iter(keys)), VITE_LINK_BASE_URL='https://nexo.doctorcreator.com.br')
        command = ['docker', 'build', '--build-arg', 'NEXO_BASE_IMAGE=' + args.expected_image, '--build-arg', 'VITE_SUPABASE_URL', '--build-arg', 'VITE_SUPABASE_PUBLISHABLE_KEY', '--build-arg', 'VITE_LINK_BASE_URL', '-f', 'scripts/vps/Dockerfile.acompanhamento', '-t', tag, '.']
        print('CONSTRUINDO ' + tag, flush=True)
        with open(task / 'build.log', 'w') as log:
            os.chmod(task / 'build.log', 0o600)
            subprocess.run(command, cwd=roots[0], env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=1200)
        print('IMAGEM_CONSTRUIDA', flush=True)
        test_service = 'doctor-creator-hub-acomp-check'
        if run(['docker', 'service', 'ls', '--filter', 'name=' + test_service, '--format', '{{.Name}}']): raise RuntimeError('Teste anterior ainda presente; conferir antes de continuar')
        command = ['docker', 'service', 'create', '--detach', '--name', test_service]
        command += ['--limit-memory', '1536M', '--limit-cpu', '1']
        cs = current['Spec']['TaskTemplate']['ContainerSpec']
        secrets = cs.get('Secrets', [])
        if not any(s.get('File', {}).get('Name') == 'hub.env' for s in secrets): raise RuntimeError('Configuração protegida do serviço não encontrada')
        for secret in secrets:
            f = secret['File']
            command += ['--secret', 'source=' + secret['SecretName'] + ',target=' + f['Name'] + ',uid=' + f['UID'] + ',gid=' + f['GID'] + ',mode=' + format(f['Mode'], '04o')]
        for value in cs.get('Env', []): command += ['--env', value]
        for network in current['Spec']['TaskTemplate'].get('Networks', []): command += ['--network', network['Target']]
        command.append(tag)
        try:
            run(command)
            check_cid = None
            for _ in range(40):
                check_cid = container(test_service)
                if check_cid: break
                time.sleep(2)
            if not check_cid: raise RuntimeError('Teste não iniciou')
            check = r"""async function main(){const base='http://127.0.0.1:3000';for(let n=0;n<30;n++){try{const h=await fetch(base+'/healthz');if(h.ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}if(process.env.SUPABASE_URL!=='https://cvdnzoqduliopscfsrkc.supabase.co')throw Error('Projeto do servidor divergente');const root=await(await fetch(base+'/admin')).text();if(!root.includes('acompanhamento-menu.js'))throw Error('Menu ausente');const page=await(await fetch(base+'/admin/acompanhamento')).text();if(!page.includes('/acompanhamento-app/assets/'))throw Error('Página incorreta');const asset=page.match(/src="([^"]+\.js)"/);if(!asset||(await fetch(base+asset[1])).status!==200)throw Error('Arquivo da interface indisponível');if((await fetch(base+'/api/sync/manual?_central=acompanhamento')).status!==401)throw Error('Recusa de acesso não confirmada');if((await fetch(base+'/acompanhamento-app/assets/ausente.js')).status!==404)throw Error('Arquivo ausente sem 404');console.log('SMOKE_OK');}try{process.loadEnvFile('/run/secrets/hub.env');await main();}catch(e){console.log(e.message);process.exit(1);} """
            print(run(['docker', 'exec', check_cid, 'node', '--input-type=module', '-e', check]), flush=True)
            metadata.write_text(json.dumps({'image': tag, 'previous': args.expected_image, 'commit': args.commit, 'tested': True}))
            print('PREPARADO_PARA_PUBLICAR', flush=True)
        finally:
            subprocess.run(['docker', 'service', 'rm', test_service], capture_output=True)
    else:
        data = json.loads(metadata.read_text())
        if data != {'image': tag, 'previous': args.expected_image, 'commit': args.commit, 'tested': True}: raise RuntimeError('Publicação sem teste confirmado')
        previous_args = current['Spec']['TaskTemplate']['ContainerSpec'].get('Args')
        if not previous_args or previous_args[-1] != 'build/vps.mjs': raise RuntimeError('Comando atual de inicialização precisa de revisão')
        new_args = previous_args[:-1] + ['build/acompanhamento-vps.mjs']
        run(['docker', 'service', 'update', '--detach', '--image', tag, '--args', shlex.join(new_args), '--update-order', 'start-first', '--update-parallelism', '1', SERVICE])
        print('ATUALIZANDO_SERVICO', flush=True)
        try:
            for _ in range(60):
                try:
                    checks = [http('https://' + domain + '.doctorcreator.com.br/healthz')[0] == 200 for domain in ['nexo', 'dash', 'sap']]
                    page = http('https://nexo.doctorcreator.com.br/admin/acompanhamento')[1]
                    if all(checks) and '/acompanhamento-app/assets/' in page: break
                except Exception: pass
                time.sleep(2)
            else: raise RuntimeError('Verificação pública não confirmou a atualização')
            print('PUBLICADO ' + tag, flush=True)
        except Exception:
            run(['docker', 'service', 'update', '--detach', '--image', args.expected_image, '--args', shlex.join(previous_args), SERVICE])
            print('REVERTIDO_PARA_IMAGEM_ANTERIOR', flush=True)
            raise

if __name__ == '__main__':
    try: main()
    except Exception as error:
        # O conteúdo das credenciais e saídas de subprocessos nunca é exibido.
        print('FALHA: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__), flush=True)
        raise SystemExit(1)
