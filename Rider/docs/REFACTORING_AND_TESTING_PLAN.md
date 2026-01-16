# Rider Plugin - Refactoring & Testing Plan

## 📊 Current State Assessment

### Codebase Overview

**Total Files**: 20 Kotlin source files
**Lines of Code**: ~3,500+ lines
**Test Coverage**: ❌ **0%** - No tests exist

### File Structure

```
src/main/kotlin/com/example/promptlibrary/
├── model/                          # Data models (3 files)
│   ├── Prompt.kt                   # Core prompt data model
│   ├── Group.kt                    # Group/taxonomy model
│   └── Library.kt                  # Top-level library container
├── repository/                     # Data persistence (1 file)
│   └── PromptRepository.kt         # 400+ lines - NEEDS REFACTORING
├── ui/                             # User interface (1 file)
│   └── PromptLibraryPanel.kt       # 1000+ lines - NEEDS MAJOR REFACTORING
├── sync/                           # Git sync operations (9 files)
│   ├── SyncOrchestrator.kt         # Main sync coordinator
│   ├── GitYamlLoader.kt            # YAML import
│   ├── GitYamlWriter.kt            # YAML export
│   ├── GitRepoManager.kt           # Repo initialization
│   ├── GitPullService.kt           # Git pull operations
│   ├── GitUtils.kt                 # Git utilities
│   ├── GitFetchScheduler.kt        # Background fetch
│   ├── WriteStrategyService.kt     # Commit strategies
│   └── PRActions.kt                # PR creation
├── yaml/                           # YAML models (2 files)
│   ├── PromptYaml.kt               # YAML prompt representation
│   └── GroupYaml.kt                # YAML group representation
├── settings/                       # Plugin settings (2 files)
│   ├── PluginSettings.kt           # Settings service
│   └── PluginSettingsConfigurable.kt # Settings UI
├── events/                         # Event system (1 file)
│   └── LibraryEvents.kt            # Event bus for library changes
└── PromptLibraryToolWindowFactory.kt # Plugin entry point

resources/META-INF/
└── plugin.xml                      # Plugin configuration
```

### Architecture Analysis

#### ✅ Strengths

1. **Clear separation of concerns** - Models, UI, sync, and persistence are separated
2. **Good use of Kotlin features** - Data classes, sealed classes, extension functions
3. **Comprehensive Git sync** - Full YAML-based sync with remote-wins merge strategy
4. **Settings management** - Proper IntelliJ settings integration
5. **Event-driven updates** - LibraryEvents for UI refresh

#### ❌ Pain Points & Refactoring Opportunities

1. **PromptLibraryPanel.kt (1000+ lines)** 🔴 **CRITICAL**

   - God object anti-pattern
   - Mixes UI layout, business logic, and event handling
   - Hard to test, hard to maintain
   - Contains: toolbar, tree view, prompt list, dialogs, sync operations

2. **PromptRepository.kt (400+ lines)** 🟡 **HIGH PRIORITY**

   - Too many responsibilities
   - Handles: persistence, CRUD, groups, migration, import/export
   - Difficult to test individual operations

3. **No dependency injection** 🟡 **MEDIUM PRIORITY**

   - Hard-coded dependencies (e.g., `PromptRepository()`)
   - Makes testing difficult
   - Tight coupling between components

4. **No error handling strategy** 🟡 **MEDIUM PRIORITY**

   - Inconsistent error handling
   - Some methods throw, some return null
   - No centralized error reporting

5. **No validation layer** 🟢 **LOW PRIORITY**

   - Business rules scattered across UI and repository
   - Duplicate detection in repository, but no other validation

6. **Sync operations tightly coupled** 🟢 **LOW PRIORITY**
   - Hard to test sync logic independently
   - Git operations mixed with business logic

---

## 🎯 Refactoring Strategy

### Phase 1: Extract UI Components (Week 1)

**Goal**: Break down PromptLibraryPanel into smaller, testable components

**Tasks**:

1. Extract `PromptCard` component (prompt display card)
2. Extract `PromptComposer` component (new prompt input area)
3. Extract `GroupTreePanel` component (group tree view)
4. Extract `PromptListPanel` component (scrollable prompt list)
5. Extract `ToolbarPanel` component (sync, import, export buttons)
6. Extract dialog classes:
   - `ImportDialog`
   - `ExportDialog`
   - `EditPromptDialog`
   - `GroupManagementDialog`

**Acceptance Criteria**:

- PromptLibraryPanel < 300 lines
- Each component is independently testable
- No functionality regression
- All components use constructor injection

### Phase 2: Refactor Repository Layer (Week 2)

**Goal**: Split PromptRepository into focused, single-responsibility classes

**Tasks**:

1. Extract `PromptStorage` - Low-level file I/O and JSON serialization
2. Extract `PromptService` - Business logic (CRUD, duplicate detection)
3. Extract `GroupService` - Group management operations
4. Extract `LibraryMigration` - V1 to V2 migration logic
5. Extract `ImportExportService` - Import/export operations
6. Create `RepositoryFacade` - Simplified API for UI layer

**Acceptance Criteria**:

- Each service < 200 lines
- Clear separation of concerns
- All services independently testable
- Backward compatibility maintained

### Phase 3: Add Dependency Injection (Week 3)

**Goal**: Introduce DI for better testability and flexibility

**Tasks**:

1. Create `ServiceLocator` or use IntelliJ's service system
2. Refactor all components to use constructor injection
3. Create factory classes for complex object creation
4. Update PromptLibraryToolWindowFactory to wire dependencies

**Acceptance Criteria**:

- No `new` keyword in business logic
- All dependencies injected via constructor
- Easy to swap implementations for testing

### Phase 4: Add Error Handling & Validation (Week 4)

**Goal**: Centralized error handling and validation

**Tasks**:

1. Create `Result<T>` sealed class for operation results
2. Create `ValidationService` for business rule validation
3. Create `ErrorHandler` for centralized error reporting
4. Update all operations to return `Result<T>`
5. Add validation for all user inputs

**Acceptance Criteria**:

- No exceptions thrown to UI layer
- All errors properly logged and reported
- Consistent validation across all operations

---

## 🧪 Testing Strategy

### Testing Framework Setup

**Dependencies to Add**:

```kotlin
// build.gradle.kts
dependencies {
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
    testImplementation("io.mockk:mockk:1.13.8")
    testImplementation("org.assertj:assertj-core:3.24.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
}
```

### Test Coverage Goals

**Target**: 80% code coverage by end of refactoring

**Priority Breakdown**:

1. **Critical (100% coverage)**: Model classes, PromptService, GroupService
2. **High (80% coverage)**: Storage, sync orchestration, validation
3. **Medium (60% coverage)**: UI components, dialogs
4. **Low (40% coverage)**: Settings, utilities

### Test Structure

```
src/test/kotlin/com/example/promptlibrary/
├── model/
│   ├── PromptTest.kt
│   ├── GroupTest.kt
│   └── LibraryTest.kt
├── service/
│   ├── PromptServiceTest.kt
│   ├── GroupServiceTest.kt
│   └── ValidationServiceTest.kt
├── storage/
│   ├── PromptStorageTest.kt
│   └── LibraryMigrationTest.kt
├── sync/
│   ├── SyncOrchestratorTest.kt
│   ├── GitYamlLoaderTest.kt
│   └── GitYamlWriterTest.kt
├── ui/
│   ├── PromptCardTest.kt
│   └── PromptComposerTest.kt
└── integration/
    ├── EndToEndSyncTest.kt
    └── ImportExportTest.kt
```

### Test Types & Examples

#### 1. Unit Tests (Model Layer)

**Example: PromptTest.kt**

```kotlin
class PromptTest {
    @Test
    fun `normalizedText should trim and lowercase`() {
        val prompt = Prompt(text = "  Hello World  ")
        assertThat(prompt.normalizedText()).isEqualTo("hello world")
    }

    @Test
    fun `normalizedText should collapse whitespace`() {
        val prompt = Prompt(text = "Hello    World")
        assertThat(prompt.normalizedText()).isEqualTo("hello world")
    }

    @Test
    fun `withUpdatedText should update timestamp`() {
        val original = Prompt(text = "Original")
        Thread.sleep(10)
        val updated = original.withUpdatedText("Updated")

        assertThat(updated.text).isEqualTo("Updated")
        assertThat(updated.updatedAt).isNotEqualTo(original.updatedAt)
    }
}
```

#### 2. Service Tests (Business Logic)

**Example: PromptServiceTest.kt**

```kotlin
class PromptServiceTest {
    private lateinit var storage: PromptStorage
    private lateinit var service: PromptService

    @BeforeEach
    fun setup() {
        storage = mockk<PromptStorage>()
        service = PromptService(storage)
    }

    @Test
    fun `addPrompt should reject duplicates`() {
        val existing = Prompt(text = "Hello World")
        every { storage.loadPrompts() } returns listOf(existing)

        val result = service.addPrompt("  hello   world  ")

        assertThat(result).isNull()
        verify(exactly = 0) { storage.savePrompts(any()) }
    }

    @Test
    fun `addPrompt should accept unique prompts`() {
        every { storage.loadPrompts() } returns emptyList()
        every { storage.savePrompts(any()) } just Runs

        val result = service.addPrompt("New Prompt")

        assertThat(result).isNotNull()
        assertThat(result?.text).isEqualTo("New Prompt")
        verify { storage.savePrompts(any()) }
    }
}
```

#### 3. Integration Tests (End-to-End)

**Example: ImportExportTest.kt**

```kotlin
class ImportExportTest {
    private lateinit var tempDir: File
    private lateinit var repository: PromptRepository

    @BeforeEach
    fun setup() {
        tempDir = Files.createTempDirectory("test").toFile()
        repository = PromptRepository(tempDir.toPath())
    }

    @AfterEach
    fun cleanup() {
        tempDir.deleteRecursively()
    }

    @Test
    fun `export and import should preserve prompts`() {
        // Add prompts
        repository.addPrompt("Prompt 1")
        repository.addPrompt("Prompt 2")

        // Export
        val exported = repository.exportToJson()

        // Clear and import
        repository.wipeAllLocalData()
        repository.importFromJson(exported)

        // Verify
        val prompts = repository.getAllPrompts()
        assertThat(prompts).hasSize(2)
        assertThat(prompts.map { it.text }).containsExactlyInAnyOrder("Prompt 1", "Prompt 2")
    }
}
```

---

## 📋 Implementation Roadmap

### Week 1: UI Component Extraction

**Day 1-2**: Extract PromptCard and PromptComposer

- Create new files in `ui/components/`
- Move code from PromptLibraryPanel
- Add unit tests for each component

**Day 3-4**: Extract GroupTreePanel and PromptListPanel

- Separate tree view logic
- Separate list rendering logic
- Add tests

**Day 5**: Extract dialogs and toolbar

- Create dialog classes
- Extract toolbar logic
- Add tests

### Week 2: Repository Refactoring

**Day 1-2**: Extract PromptStorage and PromptService

- Low-level I/O in PromptStorage
- Business logic in PromptService
- Add comprehensive tests

**Day 3**: Extract GroupService

- Group CRUD operations
- Group hierarchy management
- Add tests

**Day 4**: Extract ImportExportService and LibraryMigration

- Import/export logic
- Migration logic
- Add tests

**Day 5**: Create RepositoryFacade and integration tests

- Simplified API
- End-to-end tests

### Week 3: Dependency Injection

**Day 1-2**: Set up DI framework

- Choose approach (ServiceLocator vs IntelliJ services)
- Create service registration
- Update build.gradle.kts if needed

**Day 3-4**: Refactor components to use DI

- Update all classes to use constructor injection
- Remove hard-coded dependencies
- Update tests to use mocks

**Day 5**: Integration testing with DI

- Verify all components wire correctly
- Test in sandbox

### Week 4: Error Handling & Polish

**Day 1-2**: Add Result<T> and error handling

- Create Result sealed class
- Update all operations
- Add error handling tests

**Day 3**: Add validation layer

- Create ValidationService
- Add validation rules
- Add validation tests

**Day 4-5**: Final polish and documentation

- Code review
- Update documentation
- Final integration testing

---

## 🎯 Success Metrics

### Code Quality Metrics

- **Test Coverage**: ≥ 80%
- **Average File Size**: < 250 lines
- **Cyclomatic Complexity**: < 10 per method
- **Code Duplication**: < 5%

### Functional Metrics

- **Zero Regressions**: All existing features work
- **Performance**: No degradation in UI responsiveness
- **Backward Compatibility**: Existing data migrates correctly

### Developer Experience Metrics

- **Build Time**: No significant increase
- **Test Execution Time**: < 30 seconds for full suite
- **New Feature Velocity**: Easier to add new features post-refactoring

---

## 🚀 Getting Started

### Step 1: Set Up Testing Framework

```bash
cd Rider
# Add test dependencies to build.gradle.kts
# Create src/test/kotlin directory structure
mkdir -p src/test/kotlin/com/example/promptlibrary/{model,service,storage,sync,ui,integration}
```

### Step 2: Write First Tests

Start with model tests (easiest, highest value):

1. PromptTest.kt
2. GroupTest.kt
3. LibraryTest.kt

### Step 3: Begin Refactoring

Follow the phased approach, starting with UI component extraction.

---

**Ready to begin? Let's start with Phase 1, Task 1: Extract PromptCard component!** 🚀
