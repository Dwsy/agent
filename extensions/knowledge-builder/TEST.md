# Knowledge Builder - Test Example

## 🧪 Quick Test

This example demonstrates Knowledge Builder with a simple project.

### Test Setup

```bash
# Create a test project
mkdir -p ~/test-knowledge-builder
cd ~/test-knowledge-builder

# Create a simple React project structure
mkdir -p src/{components,services,hooks,utils}
cat > src/App.jsx << 'EOF'
import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { fetchProducts } from './services/api';
import { formatPrice } from './utils/currency';

function App() {
  const { user, login, logout } = useAuth();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetchProducts().then(setProducts);
  }, []);

  return (
    <div>
      <h1>E-Commerce App</h1>
      {user ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={() => login('user', 'pass')}>Login</button>
      )}
      {products.map(p => (
        <div key={p.id}>
          <h2>{p.name}</h2>
          <p>{formatPrice(p.price)}</p>
        </div>
      ))}
    </div>
  );
}

export default App;
EOF

cat > src/hooks/useAuth.js << 'EOF'
import { useState } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);

  const login = async (username, password) => {
    // Mock authentication
    setUser({ username, role: 'user' });
  };

  const logout = () => {
    setUser(null);
  };

  return { user, login, logout };
}
EOF

cat > src/services/api.js << 'EOF'
export async function fetchProducts() {
  const response = await fetch('/api/products');
  return response.json();
}

export async function addToCart(productId) {
  const response = await fetch('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ productId }),
  });
  return response.json();
}
EOF

cat > src/utils/currency.js << 'EOF'
export function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price);
}
EOF
```

### Run Knowledge Builder

```bash
# Initialize knowledge base
bun ~/.pi/agent/skills/knowledge-base/lib.ts init

# Run Knowledge Builder (foreground mode for testing)
knowledge-builder "Build a knowledge base for this React e-commerce project.

Requirements:
- Document all components (App)
- Explain hooks (useAuth)
- Document API services
- Document utilities
- Create guides for common workflows
- Record architectural decisions

Keep it concise but comprehensive.

Output <promise>KNOWLEDGE_BASE_COMPLETE</promise>" \
-m 20 \
-p "KNOWLEDGE_BASE_COMPLETE"
```

### Expected Behavior

1. **Initialization**: Knowledge builder starts and creates state file
2. **Analysis**: AI analyzes the project structure
3. **Discovery**: Runs `discover` to identify technical directories
4. **Documentation**: Creates concept and guide documents
5. **Index Generation**: Updates the knowledge base index
6. **Completion**: Outputs completion promise

### Verify Results

```bash
# Check knowledge base structure
tree docs/knowledge

# View generated index
cat docs/knowledge/index.md

# Search for specific topics
bun ~/.pi/agent/skills/knowledge-base/lib.ts search "useAuth"
bun ~/.pi/agent/skills/knowledge-base/lib.ts search "API"
bun ~/.pi/agent/skills/knowledge-base/lib.ts search "currency"

# Check state file
cat .pi/knowledge-builder.local.md

# View logs
cat .pi/knowledge-builder.log
```

---

## 🧪 Comprehensive Test

### Test with Tmux (Recommended)

```bash
# Start in tmux mode
knowledge-builder "Build a comprehensive knowledge base for this React e-commerce project.

Requirements:
1. Document all components and their responsibilities
2. Explain state management approach
3. Document API services and endpoints
4. Document utility functions
5. Create guides for:
   - User authentication flow
   - Product fetching
   - Adding items to cart
6. Record architectural decisions:
   - Why use custom hooks
   - API integration approach
   - State management pattern
7. Create troubleshooting guides
8. Generate comprehensive index

Make sure the knowledge base is complete enough for a new developer to understand the entire system.

Output <promise>COMPREHENSIVE_KNOWLEDGE_BASE</promise>" \
--tmux \
--session test \
-m 50 \
-p "COMPREHENSIVE_KNOWLEDGE_BASE"
```

### Monitor Progress

```bash
# In another terminal
cd ~/test-knowledge-builder

# Watch logs
tail -f .pi/knowledge-builder.log

# Check status
knowledge-builder-manager status

# View state
knowledge-builder-manager state
```

### Verify Completion

```bash
# Check if completion promise reached
grep -r "COMPREHENSIVE_KNOWLEDGE_BASE" .pi/knowledge-builder.local.md

# View final knowledge base
tree docs/knowledge

# Check document count
find docs/knowledge -name "*.md" | wc -l

# View index
cat docs/knowledge/index.md
```

---

## 🧪 Stress Test

### Test with Complex Project

```bash
# Create a more complex project
mkdir -p ~/test-knowledge-builder-complex
cd ~/test-knowledge-builder-complex

# Create multiple services
mkdir -p src/{components/{auth,products,cart,checkout},services/{auth,products,cart,payment},hooks,utils,store,types}

# Create example files
cat > src/store/index.js << 'EOF'
import { createStore } from 'redux';
import authReducer from './auth';
import productsReducer from './products';
import cartReducer from './cart';

const store = createStore(
  combineReducers({
    auth: authReducer,
    products: productsReducer,
    cart: cartReducer,
  })
);

export default store;
EOF

# Add more files...

# Run with high iteration count
knowledge-builder "Build an enterprise-grade knowledge base for this complex e-commerce system.

Requirements:
- Document all components, services, hooks, and utilities
- Explain Redux store structure and reducers
- Document all API services
- Create comprehensive guides for all workflows
- Record all architectural decisions
- Document type definitions
- Create troubleshooting guides
- Generate diagrams and visualizations
- Create onboarding materials
- Document deployment and CI/CD

Make it production-ready and comprehensive.

Output <promise>ENTERPRISE_KNOWLEDGE_BASE</promise>" \
--tmux \
--session complex-test \
-m 100 \
-p "ENTERPRISE_KNOWLEDGE_BASE"
```

---

## 🧪 Error Handling Test

### Test with Invalid Input

```bash
# Test with empty prompt (should fail)
knowledge-builder "" 2>&1

# Test with too few iterations
knowledge-builder "Build knowledge base" -m 5

# Test with invalid session name handling
knowledge-builder "Test" --session "invalid/name with spaces" --tmux
```

---

## 🧪 Concurrency Test

### Test Multiple Sessions

```bash
# Terminal 1
cd ~/test-knowledge-builder
knowledge-builder "Test session 1" --tmux --session test1 -m 20

# Terminal 2
cd ~/test-knowledge-builder
knowledge-builder "Test session 2" --tmux --session test2 -m 20

# Terminal 3
cd ~/test-knowledge-builder
knowledge-builder "Test session 3" --tmux --session test3 -m 20

# Terminal 4: Monitor all
knowledge-builder-manager list
```

---

## 📊 Test Checklist

Use this checklist to verify Knowledge Builder functionality:

### Basic Functionality
- [ ] Initialize knowledge base
- [ ] Scan project codebase
- [ ] Discover project structure
- [ ] Create concept documents
- [ ] Create guide documents
- [ ] Create decision documents
- [ ] Generate index
- [ ] Search knowledge base
- [ ] Detect completion promise
- [ ] Stop at max iterations

### Tmux Mode
- [ ] Create tmux session
- [ ] Run in background
- [ ] Attach to session
- [ ] Detach from session
- [ ] Kill session
- [ ] List sessions
- [ ] Show status
- [ ] View logs
- [ ] View state

### State Management
- [ ] Create state file
- [ ] Update state each iteration
- [ ] Track iteration count
- [ ] Track progress
- [ ] Persist state across sessions

### Error Handling
- [ ] Handle empty prompt
- [ ] Handle missing commands
- [ ] Handle max iterations
- [ ] Handle tmux errors
- [ ] Handle file system errors

### Documentation Quality
- [ ] Documents are well-structured
- [ ] Concepts are clearly defined
- [ ] Guides are actionable
- [ ] Decisions are well-reasoned
- [ ] Index is comprehensive
- [ ] Links work correctly

---

## 🎯 Success Criteria

Knowledge Builder is working correctly if:

1. ✅ Starts without errors
2. ✅ Analyzes project structure
3. ✅ Creates meaningful documentation
4. ✅ Updates state correctly
5. ✅ Detects completion promise
6. ✅ Stops at max iterations if not complete
7. ✅ Works in both foreground and tmux modes
8. ✅ Generates valid markdown documents
9. ✅ Creates comprehensive index
10. ✅ Provides useful logs and state information

---

## 🚀 Next Steps

After successful testing:

1. **Deploy to Production**: Use for real projects
2. **Customize Prompts**: Create prompt templates for common scenarios
3. **Monitor Costs**: Track API usage and costs
4. **Iterate**: Refine prompts and iteration counts
5. **Share**: Share results with team

---

**Happy Knowledge Building!** 🎉