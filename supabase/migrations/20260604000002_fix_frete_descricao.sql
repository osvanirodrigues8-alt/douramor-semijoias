-- Corrige descricao_loja e contexto_loja que ainda mencionavam "frete grátis acima de R$ 200"
-- O frete é grátis para todos os pedidos, sem valor mínimo

UPDATE configuracoes SET
  descricao_loja = 'A Douramor nasceu do amor por acessórios que realçam a beleza do dia a dia. Somos uma loja especializada em semi joias banhadas a ouro 18k e prata 925, com peças pensadas para quem quer se sentir especial — sem precisar gastar uma fortuna. Trabalhamos com brincos, anéis, colares, gargantilhas, chokers, pulseiras, correntes, braceletes, tornozeleiras, conjuntos e muito mais. Entregamos para todo o Brasil com frete grátis em todos os pedidos e parcelamos em até 12x sem juros.',
  diferenciais_loja = 'Frete grátis para todo o Brasil em todos os pedidos' || chr(10) ||
                      'Parcelamento em até 12x sem juros no cartão' || chr(10) ||
                      'Peças banhadas a ouro 18k e prata 925 com alta durabilidade' || chr(10) ||
                      'Garantia de 1 ano contra defeitos de fabricação' || chr(10) ||
                      'Loja física em Matozinhos-MG: R. Montes Claros 700, Loja A'
WHERE id IS NOT NULL;

UPDATE configuracoes_agente SET
  contexto_loja = 'Douramor Semi Joias — brincos, anéis, colares, pulseiras e muito mais, banhados a ouro 18k e prata 925. Frete grátis para todo o Brasil em todos os pedidos. Garantia de 1 ano. Loja física em Matozinhos-MG (R. Montes Claros 700, Loja A) e atendimento online pelo WhatsApp.'
WHERE id IS NOT NULL;
