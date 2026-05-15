UPDATE public.produtos
SET url_produto = url_foto,
    url_foto = NULL
WHERE url_foto LIKE '%douramor.com.br%';