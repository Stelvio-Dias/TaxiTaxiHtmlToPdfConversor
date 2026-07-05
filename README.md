# Serviço HTML → PDF (Node.js + Puppeteer)

Microserviço que recebe uma string HTML e devolve o PDF correspondente.
Pensado para ser chamado pelo teu servidor .NET, que por sua vez reencaminha o
PDF para o front-end Angular.

```
Angular  ──▶  .NET (gera o HTML)  ──▶  este serviço Node (HTML → PDF)  ──▶  .NET  ──▶  Angular
```

## Endpoints

### `POST /pdf`
Recebe o HTML e devolve `application/pdf` (binário).

Duas formas de enviar o HTML:

**JSON** (recomendado — permite passar opções):
```json
{
  "html": "<html>...</html>",
  "options": { "landscape": false, "format": "A4" }
}
```

**text/html cru:**
```
Content-Type: text/html

<html>...</html>
```

O objeto `options` é passado diretamente a `page.pdf()` do Puppeteer
(`format`, `landscape`, `margin`, `printBackground`, `displayHeaderFooter`,
`headerTemplate`, `footerTemplate`, etc.).

### `GET /health`
Devolve `{ "ok": true }`. Útil para health checks do Render/Fly/Railway.

## Correr localmente

Precisas do Chromium/Chrome instalado. Aponta o caminho com `CHROMIUM_PATH`
ou deixa o serviço procurar nos locais habituais.

```bash
npm install
CHROMIUM_PATH=/usr/bin/chromium npm start
```

## Correr com Docker (recomendado para deploy)

```bash
docker build -t html-to-pdf .
docker run -p 3000:3000 html-to-pdf
```

A imagem já traz o Chromium e as fontes. Serve para Render, Fly.io, Railway,
uma VPS, ou ao lado da tua API .NET em docker-compose.

## Exemplo de chamada (curl)

```bash
curl -X POST http://localhost:3000/pdf \
  -H "Content-Type: application/json" \
  -d '{"html":"<h1>Fatura 385.000,00 Kz</h1>"}' \
  -o fatura.pdf
```

## Integração com o servidor .NET

Regista um `HttpClient` e chama o serviço:

```csharp
// Program.cs
builder.Services.AddHttpClient("pdf", c =>
{
    c.BaseAddress = new Uri("http://localhost:3000"); // ou o host do container
});
```

```csharp
public class PdfService
{
    private readonly IHttpClientFactory _factory;
    public PdfService(IHttpClientFactory factory) => _factory = factory;

    public async Task<byte[]> HtmlParaPdfAsync(string html, CancellationToken ct = default)
    {
        var client = _factory.CreateClient("pdf");

        using var resp = await client.PostAsJsonAsync("/pdf", new { html }, ct);
        resp.EnsureSuccessStatusCode();

        return await resp.Content.ReadAsByteArrayAsync(ct);
    }
}
```

No controller devolves o PDF ao Angular como já fazes:

```csharp
[HttpPost("faturas/{id}/pdf")]
public async Task<IActionResult> GerarPdf(int id)
{
    string html = _templateService.RenderFatura(id); // o teu HTML
    byte[] pdf = await _pdfService.HtmlParaPdfAsync(html);
    return File(pdf, "application/pdf", $"fatura-{id}.pdf");
}
```

## Notas de produção

- **Reutilização do browser:** o serviço lança um único Chromium e reutiliza-o
  entre pedidos (fecha só a página a cada pedido). Isto torna cada conversão
  rápida; lançar um browser por pedido levaria segundos.
- **Concorrência:** para muito volume, corre várias réplicas atrás de um load
  balancer em vez de forçar um só processo. Cada página é isolada, mas o
  Chromium tem limites práticos de páginas simultâneas.
- **`--disable-dev-shm-usage`** já está ativo, o que evita crashes em containers
  com `/dev/shm` pequeno (comum em plataformas serverless/containers).
- **Cabeçalhos/rodapés e numeração de páginas:** passa
  `displayHeaderFooter: true` com `headerTemplate`/`footerTemplate` em `options`.
- **Onde alojar:** um container long-running (Render, Fly.io, Railway, VPS) é
  muito mais previsível para geração de PDF do que serverless (Vercel), onde o
  tamanho do Chromium e os timeouts curtos complicam.
