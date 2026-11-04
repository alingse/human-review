use clap::{Parser, Subcommand, ValueEnum};

#[derive(Parser, Debug)]
#[command(name = "hrevu", author = "hrevu", version = "0.1.6")]
#[command(
    about = "Human review CLI tool for AI",
    subcommand_negates_reqs = true,
    args_conflicts_with_subcommands = true
)]
pub struct Args {
    /// Input: commit hash, file path, or "diff"
    #[arg(value_name = "INPUT", required = true)]
    pub input: Option<String>,

    #[command(subcommand)]
    pub command: Option<Command>,

    /// Port for web server (default: random available port)
    #[arg(short, long, default_value = "0", global = true)]
    pub port: u16,

    /// Output structured JSON
    #[arg(long, global = true)]
    pub json: bool,

    /// Exit after completion; the saved review remains available through history
    #[arg(long, global = true)]
    pub exit_on_complete: bool,

    /// Print the URL without launching a browser
    #[arg(long, global = true)]
    pub no_open: bool,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Browse saved reviews (or list them with --json)
    History,
    /// Read a review, including comments submitted while it is still in progress
    Show { id: String },
    /// Continue an unfinished review using its saved content and comments
    Resume { id: String },
    /// Export a saved review, without starting the web server
    Export {
        id: String,
        #[arg(long, value_enum, default_value = "json")]
        format: ExportFormat,
        #[arg(short, long)]
        output: Option<std::path::PathBuf>,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum ExportFormat {
    Json,
    Text,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_targets_and_history_commands_parse() {
        let args = Args::try_parse_from(["hrevu", "README.md", "--exit-on-complete"]).unwrap();
        assert_eq!(args.input.as_deref(), Some("README.md"));
        assert!(args.exit_on_complete);
        let args = Args::try_parse_from(["hrevu", "history", "--json"]).unwrap();
        assert!(matches!(args.command, Some(Command::History)));
        assert!(args.json);
        assert!(Args::try_parse_from(["hrevu"]).is_err());
        assert!(Args::try_parse_from(["hrevu", "show", "id", "--json"]).is_ok());
    }
}
