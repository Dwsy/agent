# Knowledge Builder - Usage Examples

## 🎯 Complete Example: Documenting a React E-commerce Project

### Step 1: Start Knowledge Builder

```bash
cd ~/projects/my-ecommerce-app

knowledge-builder "Build a comprehensive knowledge base for my React e-commerce project.

Requirements:
- Document all React components
- Explain state management with Redux
- Document API integrations (products, cart, checkout)
- Create guides for common workflows
- Record architectural decisions
- Document authentication flow
- Explain payment integration
- Create troubleshooting guides

Process:
1. Scan the codebase
2. Identify key concepts (components, hooks, services)
3. Create concept documents for all major components
4. Write guides for common workflows (add to cart, checkout, etc.)
5. Document API endpoints and their usage
6. Record architectural decisions
7. Generate comprehensive index

Make sure the knowledge base is complete enough for a new developer to understand the entire system.

Output <promise>KNOWLEDGE_BASE_COMPLETE</promise>" \
--tmux \
--session ecommerce \
-m 100 \
-p "KNOWLEDGE_BASE_COMPLETE"
```

### Step 2: Monitor Progress

In another terminal:

```bash
# Watch logs in real-time
tail -f ~/projects/my-ecommerce-app/.pi/knowledge-builder.log

# Or use the manager
cd ~/projects/my-ecommerce-app
knowledge-builder-manager status
```

### Step 3: Check Progress Periodically

```bash
# View current state
knowledge-builder-manager state

# View recent iterations
cat .pi/knowledge-builder-iteration-*.txt | tail -100

# Check knowledge base structure
tree docs/knowledge
```

### Step 4: Review Generated Knowledge Base

Once complete:

```bash
# View the generated index
cat docs/knowledge/index.md

# Browse the structure
tree docs/knowledge

# Search for specific topics
bun ~/.pi/agent/skills/knowledge-base/lib.ts search "Redux"
bun ~/.pi/agent/skills/knowledge-base/lib.ts search "cart"
```

---

## 📚 Example 2: API Documentation

### Scenario

You have a REST API and need comprehensive documentation.

```bash
cd ~/projects/my-api

knowledge-builder "Generate complete API documentation for this REST API.

Requirements:
- Document all endpoints (GET, POST, PUT, DELETE)
- Explain request/response formats with examples
- Document authentication and authorization
- Create usage examples for each endpoint
- Document error codes and handling
- Explain rate limiting
- Document pagination
- Create integration guides

Focus on making it easy for frontend developers to integrate with this API.

Output <promise>API_DOCUMENTATION_COMPLETE</promise>" \
--tmux \
--session api-docs \
-m 50 \
-p "API_DOCUMENTATION_COMPLETE"
```

### Expected Output

The AI will:
1. Scan the API codebase
2. Identify all routes and endpoints
3. Create concept documents for key API concepts
4. Write guides for each endpoint
5. Document authentication flow
6. Create integration examples
7. Generate a comprehensive index

---

## 🎓 Example 3: Onboarding Knowledge Base

### Scenario

New team members need a comprehensive guide to understand the project.

```bash
cd ~/projects/my-app

knowledge-builder "Create an onboarding knowledge base for new team members.

Requirements:
- Project overview and architecture
- Technology stack and why it was chosen
- Setup instructions for local development
- Development workflow and conventions
- Git workflow and branching strategy
- Code review guidelines
- Testing practices
- Deployment process
- Common tasks and how to do them
- Troubleshooting common issues
- Team structure and contact information
- Documentation links and resources

Make it comprehensive enough that a new developer can be productive within their first week.

Output <promise>ONBOARDING_KIT_COMPLETE</promise>" \
--tmux \
--session onboarding \
-m 80 \
-p "ONBOARDING_KIT_COMPLETE"
```

---

## 🔧 Example 4: Legacy Code Documentation

### Scenario

You inherited a legacy codebase with minimal documentation.

```bash
cd ~/projects/legacy-app

knowledge-builder "Document this legacy codebase.

Focus on:
- Understanding the overall architecture
- Identifying key modules and their responsibilities
- Documenting data flow between modules
- Explaining business logic and rules
- Identifying technical debt and potential issues
- Creating migration guides
- Documenting deployment process
- Explaining configuration and environment variables
- Creating troubleshooting guides

Make it comprehensive enough for future developers to understand and maintain this system.

Output <promise>LEGACY_DOCUMENTATION_COMPLETE</promise>" \
--tmux \
--session legacy \
-m 150 \
-p "LEGACY_DOCUMENTATION_COMPLETE"
```

---

## 🚀 Example 5: Microservices Documentation

### Scenario

Document a microservices architecture with multiple services.

```bash
cd ~/projects/microservices

knowledge-builder "Document our microservices architecture.

Requirements:
- Document each service and its responsibilities
- Explain service communication patterns (REST, gRPC, message queues)
- Document service discovery
- Explain authentication and authorization between services
- Document deployment strategies
- Create service dependency diagrams
- Document configuration management
- Explain monitoring and logging
- Create troubleshooting guides for common issues
- Document scaling strategies

Make sure the knowledge base covers all services and their interactions.

Output <promise>MICROSERVICES_DOCUMENTATION_COMPLETE</promise>" \
--tmux \
--session microservices \
-m 120 \
-p "MICROSERVICES_DOCUMENTATION_COMPLETE"
```

---

## 📊 Example 6: Quick Documentation (No Tmux)

### Scenario

Small project, quick documentation needed.

```bash
cd ~/projects/small-app

knowledge-builder "Document the key components and concepts in this project:
- Main application structure
- Key components and their purpose
- State management approach
- API integration
- Important configuration

Keep it concise but comprehensive." \
-m 20 \
-p "DOCUMENTATION_COMPLETE"
```

---

## 🎯 Example 7: Multiple Projects

### Scenario

Document multiple related projects simultaneously.

```bash
# Terminal 1: Project A
cd ~/projects/project-a
knowledge-builder "Document Project A" --tmux --session project-a -m 50

# Terminal 2: Project B
cd ~/projects/project-b
knowledge-builder "Document Project B" --tmux --session project-b -m 50

# Terminal 3: Project C
cd ~/projects/project-c
knowledge-builder "Document Project C" --tmux --session project-c -m 50

# Monitor all projects
knowledge-builder-manager list
```

---

## 🔍 Example 8: Focused Documentation

### Scenario

Document only specific aspects of a project.

```bash
cd ~/projects/my-app

knowledge-builder "Document only the authentication and authorization system.

Requirements:
- Explain authentication flow
- Document JWT implementation
- Explain role-based access control
- Document session management
- Create security best practices guide
- Document common auth workflows

Focus deeply on auth, ignore other parts of the system.

Output <promise>AUTH_DOCUMENTATION_COMPLETE</promise>" \
--tmux \
-m 40 \
-p "AUTH_DOCUMENTATION_COMPLETE"
```

---

## 📈 Example 9: Continuous Documentation

### Scenario

Keep documentation up to date as code changes.

```bash
# After major feature changes
knowledge-builder "Update the knowledge base to reflect recent changes:
- New user dashboard feature
- Updated API endpoints
- New state management approach
- Refactored component structure

Update existing documents and create new ones as needed.

Output <promise>DOCUMENTATION_UPDATED</promise>" \
-m 30 \
-p "DOCUMENTATION_UPDATED"
```

---

## 🎨 Example 10: Knowledge Base Audit

### Scenario

Audit existing documentation for completeness.

```bash
cd ~/projects/my-app

knowledge-builder "Audit the existing knowledge base.

Requirements:
- Check if all major components are documented
- Verify all guides are up to date
- Check for missing architectural decisions
- Identify gaps in documentation
- Suggest improvements
- Create a comprehensive audit report

Focus on identifying what's missing and what needs to be updated.

Output <promise>AUDIT_COMPLETE</promise>" \
--tmux \
-m 50 \
-p "AUDIT_COMPLETE"
```

---

## 💡 Tips for Success

### 1. Be Specific

```bash
# Good
knowledge-builder "Document the React components, focusing on:
- Component hierarchy
- Props and state
- Key patterns used
- Common workflows"

# Bad
knowledge-builder "Document the components"
```

### 2. Set Realistic Iterations

```bash
# Small project
knowledge-builder "Quick docs" -m 20

# Large project
knowledge-builder "Comprehensive docs" -m 150
```

### 3. Use Tmux for Large Tasks

```bash
# Always use tmux for > 30 iterations
knowledge-builder "Large documentation task" --tmux -m 100
```

### 4. Monitor Progress

```bash
# In another terminal
watch -n 10 'knowledge-builder-manager status'
```

### 5. Review and Iterate

```bash
# After completion, review
knowledge-builder-manager status

# If incomplete, run again
knowledge-builder "Continue building" --tmux -m 50
```

---

## 🚨 Common Issues and Solutions

### Issue: Knowledge Base Incomplete

**Solution**: Run again with more iterations

```bash
knowledge-builder "Continue building the knowledge base" \
  --tmux \
  -m 100 \
  -p "KNOWLEDGE_BASE_COMPLETE"
```

### Issue: Too Many Documents Created

**Solution**: Be more specific in your prompt

```bash
knowledge-builder "Document only the core components:
- AuthService
- UserService
- ProductService
Ignore utility functions and helper methods." \
-m 30
```

### Issue: Documents Too Generic

**Solution**: Focus on specific aspects

```bash
knowledge-builder "Create detailed guides for:
- How to add a new product
- How to process a payment
- How to handle errors
Include code examples and step-by-step instructions." \
-m 50
```

---

## 🎉 Conclusion

Knowledge Builder makes it easy to create comprehensive knowledge bases using natural language. Just describe what you want, and the AI does the rest!

For more information, see the main [README.md](README.md).