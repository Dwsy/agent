# dw fish completion (alias for deepwiki)

complete -c dw -f

# Commands
complete -c dw -n '__fish_use_subcommand' -a 'read_wiki_structure' -d 'Get repository documentation structure'
complete -c dw -n '__fish_use_subcommand' -a 'rws' -d '[alias] Get repository documentation structure'
complete -c dw -n '__fish_use_subcommand' -a 'str' -d '[alias] Get repository documentation structure'
complete -c dw -n '__fish_use_subcommand' -a 'read_wiki_contents' -d 'Read specific documentation content'
complete -c dw -n '__fish_use_subcommand' -a 'rwc' -d '[alias] Read specific documentation content'
complete -c dw -n '__fish_use_subcommand' -a 'cont' -d '[alias] Read specific documentation content'
complete -c dw -n '__fish_use_subcommand' -a 'ask_question' -d 'Ask questions about the repository'
complete -c dw -n '__fish_use_subcommand' -a 'aq' -d '[alias] Ask questions about the repository'
complete -c dw -n '__fish_use_subcommand' -a 'ask' -d '[alias] Ask questions about the repository'

# Options
complete -c dw -s r -l repoName -l repo -d 'Repository name (e.g., "owner/repo")'
complete -c dw -s t -l topic -d 'Documentation topic name'
complete -c dw -s q -l question -d 'Your question about the repository'
complete -c dw -s l -l lang -d 'Language (en|zh)' -x -a 'en zh'
complete -c dw -s h -l help -d 'Show help'

# Command-specific options
complete -c dw -n '__fish_seen_subcommand_from read_wiki_structure rws str' -s r -l repoName -l repo
complete -c dw -n '__fish_seen_subcommand_from read_wiki_structure rws str' -s l -l lang
complete -c dw -n '__fish_seen_subcommand_from read_wiki_structure rws str' -s h -l help

complete -c dw -n '__fish_seen_subcommand_from read_wiki_contents rwc cont' -s r -l repoName -l repo
complete -c dw -n '__fish_seen_subcommand_from read_wiki_contents rwc cont' -s t -l topic
complete -c dw -n '__fish_seen_subcommand_from read_wiki_contents rwc cont' -s l -l lang
complete -c dw -n '__fish_seen_subcommand_from read_wiki_contents rwc cont' -s h -l help

complete -c dw -n '__fish_seen_subcommand_from ask_question aq ask' -s r -l repoName -l repo
complete -c dw -n '__fish_seen_subcommand_from ask_question aq ask' -s q -l question
complete -c dw -n '__fish_seen_subcommand_from ask_question aq ask' -s l -l lang
complete -c dw -n '__fish_seen_subcommand_from ask_question aq ask' -s h -l help