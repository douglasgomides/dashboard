// Acrescenta acesso ao módulo sem substituir a navegação da versão em produção.
(() => {
  function atualizar() {
    const nav = document.querySelector('nav[aria-label="Menu da equipe"]');
    const modelo = nav && nav.querySelector('a[href="/admin"]');
    if (!modelo || nav.querySelector('a[href="/admin/acompanhamento"]')) return;
    const link = document.createElement('a');
    link.href = '/admin/acompanhamento';
    link.className = modelo.className.replace(/\b(is-active|active|selected)\b/g, '');
    link.textContent = 'Acompanhamento';
    const item = document.createElement('li'); item.append(link);
    const lista = modelo.closest('li')?.parentElement;
    if (lista) lista.prepend(item);
  }
  atualizar(); new MutationObserver(atualizar).observe(document.body, { childList: true, subtree: true });
})();
