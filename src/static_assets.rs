use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "templates/"]
struct Templates;

#[derive(RustEmbed)]
#[folder = "static/"]
struct Static;

pub fn get_template(name: &str) -> Option<String> {
    Templates::get(name)
        .and_then(|asset| String::from_utf8(asset.data.to_vec()).ok())
}

pub fn get_asset(path: &str) -> Option<(Vec<u8>, &'static str)> {
    let asset_path = path
        .strip_prefix("/static/")
        .or_else(|| path.strip_prefix("static/"))
        .unwrap_or(path);

    let asset = Static::get(asset_path)?;
    let mime = get_mime_type(asset_path);
    Some((asset.data.to_vec(), mime))
}

fn get_mime_type(path: &str) -> &'static str {
    let ext = path.rsplit('.').next();
    match ext {
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("html") => "text/html",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("woff") | Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("eot") => "application/vnd.ms-fontobject",
        _ => "application/octet-stream",
    }
}
