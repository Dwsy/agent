#!/usr/bin/env python3
"""
mcp-to-skill CLI
===============
Command-line interface for converting MCP servers to Claude Skills.
"""

import argparse
import sys
from pathlib import Path

from converter import (
    MCPConfig,
    SkillConfig,
    Transport,
    convert_to_skill,
    validate_skill,
    test_skill,
    get_skill_status,
    reset_skill_stats,
    MCPConverterError
)


def cmd_convert(args):
    """Convert MCP config to skill."""
    try:
        import json
        with open(args.config, 'r') as f:
            config_data = json.load(f)
        
        mcp_config = MCPConfig(**config_data)
        skill_config = SkillConfig(
            output_dir=args.output,
            install=not args.no_install,
            verbose=args.verbose
        )
        
        skill_info = convert_to_skill(mcp_config, skill_config)
        
        print(f"✓ Skill generated: {skill_info.path}")
        print(f"✓ Tools: {len(skill_info.tools)}")
        print(f"✓ Context saved: {skill_info.context_saved}")
        print(f"✓ Transport: {skill_info.transport}")
        
    except MCPConverterError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_validate(args):
    """Validate a skill."""
    try:
        result = validate_skill(args.path)
        
        if result.get("valid"):
            print(f"✓ Skill is valid")
            print(f"✓ Tools: {len(result.get('tools', []))}")
            print(f"✓ Files: {', '.join(result.get('files', []))}")
        else:
            print(f"✗ Skill validation failed")
            print(f"Error: {result.get('error')}")
            sys.exit(1)
            
    except MCPConverterError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_test(args):
    """Test a skill."""
    try:
        result = test_skill(
            args.path,
            mode=args.mode,
            tool_name=args.tool,
            arguments=eval(args.args) if args.args else None
        )
        
        if result.get("success"):
            print(f"✓ Test passed")
            if args.verbose:
                import json
                print(json.dumps(result.get("output"), indent=2))
        else:
            print(f"✗ Test failed")
            print(f"Error: {result.get('error')}")
            sys.exit(1)
            
    except MCPConverterError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_status(args):
    """Get skill status."""
    try:
        status = get_skill_status(args.path)
        import json
        print(json.dumps(status, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_reset_stats(args):
    """Reset skill statistics."""
    try:
        result = reset_skill_stats(args.path)
        if result.get("success"):
            print("✓ Statistics reset successfully")
        else:
            print(f"✗ Failed: {result.get('error')}")
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="mcp-to-skill: Convert MCP servers to Claude Skills",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s convert my-mcp.json
  %(prog)s validate ~/.claude/skills/my-mcp
  %(prog)s test ~/.claude/skills/my-mcp --mode list
  %(prog)s status ~/.claude/skills/my-mcp
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Convert command
    convert_parser = subparsers.add_parser('convert', help='Convert MCP config to skill')
    convert_parser.add_argument('config', help='MCP configuration JSON file')
    convert_parser.add_argument('--output', '-o', help='Output directory')
    convert_parser.add_argument('--no-install', action='store_true', help='Do not install dependencies')
    convert_parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    convert_parser.set_defaults(func=cmd_convert)
    
    # Validate command
    validate_parser = subparsers.add_parser('validate', help='Validate a skill')
    validate_parser.add_argument('path', help='Path to skill directory')
    validate_parser.set_defaults(func=cmd_validate)
    
    # Test command
    test_parser = subparsers.add_parser('test', help='Test a skill')
    test_parser.add_argument('path', help='Path to skill directory')
    test_parser.add_argument('--mode', choices=['list', 'describe', 'call'], default='list', help='Test mode')
    test_parser.add_argument('--tool', help='Tool name (for describe/call)')
    test_parser.add_argument('--args', help='Tool arguments as Python dict (for call)')
    test_parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    test_parser.set_defaults(func=cmd_test)
    
    # Status command
    status_parser = subparsers.add_parser('status', help='Get skill status')
    status_parser.add_argument('path', help='Path to skill directory')
    status_parser.set_defaults(func=cmd_status)
    
    # Reset stats command
    reset_parser = subparsers.add_parser('reset-stats', help='Reset skill statistics')
    reset_parser.add_argument('path', help='Path to skill directory')
    reset_parser.set_defaults(func=cmd_reset_stats)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    args.func(args)


if __name__ == '__main__':
    main()