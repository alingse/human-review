use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "hrevu")]
#[command(author = "hrevu")]
#[command(version = "0.1.2")]
#[command(about = "Human review CLI tool for AI", long_about = None)]
pub struct Args {
    /// Input: commit hash, file path, or "diff"
    #[arg(value_name = "INPUT")]
    pub input: String,

    /// Port for web server (default: random available port)
    #[arg(short, long, default_value = "0")]
    pub port: u16,

    /// Output results in JSON format
    #[arg(long, default_value = "false")]
    pub json: bool,
}
