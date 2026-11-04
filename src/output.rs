use crate::models::ReviewData;
use colored::Colorize;
use std::collections::HashMap;

/// Print JSON formatted output
pub fn print_json(data: &crate::models::ReviewSession) {
    if let Ok(json) = serde_json::to_string_pretty(data) {
        println!("{}", json);
    }
}

/// Print comment summary (terminal format)
pub fn print_summary(data: &ReviewData, file_contents: &HashMap<String, Vec<String>>) {
    println!();
    println!("{}", "═".repeat(60));
    println!("{}", "📋 Review Summary".bold().cyan());
    println!("{}", "═".repeat(60));
    println!();

    println!("{}: {}", "Input".bold(), data.input);
    println!(
        "{}: {}",
        "Created".bold(),
        data.created_at.format("%Y-%m-%d %H:%M:%S")
    );
    println!("{}: {}", "Comments".bold(), data.comments.len());
    println!();

    if data.comments.is_empty() {
        println!("{}", "No comments added.".dimmed());
        println!();
        return;
    }

    let mut by_file: std::collections::HashMap<Option<String>, Vec<&crate::models::Comment>> =
        std::collections::HashMap::new();
    for comment in &data.comments {
        by_file
            .entry(comment.file.clone())
            .or_default()
            .push(comment);
    }

    for (file, comments) in by_file.iter() {
        if let Some(f) = file {
            println!("\n{}", format!("📄 {}", f).bold());
        } else {
            println!("\n{}", "💬 Global Comments".bold());
        }

        for comment in comments {
            println!();
            print!("💬 ");

            if let Some(anchor) = &comment.anchor {
                print!("≈ Lines {}–{}: ", anchor.start_line, anchor.end_line);
            } else if let Some(line) = comment.line {
                print!("{} {}", "Line".yellow(), line.to_string().yellow());
                if let Some(column) = comment.column {
                    print!(", {} {}", "Column".yellow(), column.to_string().yellow());
                }
                print!(": ");
            }

            println!("{}", comment.text);

            if comment.side == Some(crate::models::DiffSide::Old) {
                println!("    {}", "Previous version / removed content".dimmed());
            }
            if let Some(anchor) = &comment.anchor {
                println!("    > {}", anchor.quote.replace('\n', "\n    > "));
            }

            if let (Some(file_path), Some(line_num)) = (&comment.file, comment.line) {
                if let Some(lines) = file_contents.get(file_path) {
                    let idx = (line_num as usize).saturating_sub(1);

                    let context_start = idx.saturating_sub(3);
                    let context_end = idx;

                    for i in context_start..context_end {
                        if i < lines.len() {
                            let line_num_display = i + 1;
                            let content = lines[i].trim();
                            if !content.is_empty() {
                                println!(
                                    "    {} {} {}",
                                    (line_num_display as u32).to_string().dimmed(),
                                    "│".dimmed(),
                                    content.dimmed()
                                );
                            }
                        }
                    }

                    if idx < lines.len() {
                        let content = lines[idx].trim();
                        if !content.is_empty() {
                            println!(
                                "    {} {} {}",
                                line_num.to_string().yellow().bold(),
                                "▸".yellow().bold(),
                                content.yellow()
                            );
                        }
                    }
                }
            }

            println!(
                "    {} {}",
                "─".dimmed(),
                comment.created_at.format("%H:%M").to_string().dimmed()
            );
        }
    }

    println!();
    println!("{}", "─".repeat(60).dimmed());
    println!(
        "{} {} total comments",
        "Summary:".bold(),
        data.comments.len().to_string().cyan()
    );
}

/// A portable text export for forwarding feedback without running the server.
pub fn export_text(session: &crate::models::ReviewSession) -> String {
    use std::fmt::Write;
    let mut text = format!(
        "{}\nReview: {}\nCreated: {}\nStatus: {:?}\nComments: {}\n\n",
        session.data.input,
        session.id,
        session.data.created_at,
        session.data.status,
        session.data.comments.len()
    );
    for (index, comment) in session.data.comments.iter().enumerate() {
        let _ = write!(
            text,
            "{}. {}",
            index + 1,
            comment.file.as_deref().unwrap_or("Global comment")
        );
        if let Some(anchor) = &comment.anchor {
            let _ = write!(text, " · ≈ L{}–{}", anchor.start_line, anchor.end_line);
        } else if let Some(line) = comment.line {
            let _ = write!(text, " · L{line}");
            if let Some(column) = comment.column {
                let _ = write!(text, ":C{column}");
            }
        }
        if comment.side == Some(crate::models::DiffSide::Old) {
            text.push_str(" (previous version)");
        }
        text.push('\n');
        let quote = comment
            .anchor
            .as_ref()
            .map(|anchor| anchor.quote.clone())
            .or_else(|| {
                session
                    .files
                    .iter()
                    .find(|file| Some(&file.path) == comment.file.as_ref())
                    .and_then(|file| {
                        file.lines
                            .iter()
                            .find(|line| {
                                Some(line.number) == comment.line
                                    && (line.type_.as_deref() == Some("removed"))
                                        == (comment.side == Some(crate::models::DiffSide::Old))
                            })
                            .map(|line| line.content.clone())
                    })
            });
        if let Some(quote) = quote {
            let _ = writeln!(text, "> {}", quote.replace('\n', "\n> "));
        }
        let _ = writeln!(text, "{}\n", comment.text);
    }
    text
}
