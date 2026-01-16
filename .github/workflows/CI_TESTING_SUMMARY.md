# CI/CD Testing Updates

## Overview
Added comprehensive testing and reporting for the Rider plugin in the GitHub Actions workflow.

## Changes Made to `build-and-release.yml`

### New Steps Added (after "Warm IntelliJ Platform cache")

1. **Run Rider plugin tests**
   - Executes all unit tests using `./gradlew test`
   - 10-minute timeout to prevent hanging
   - Runs before building the plugin to catch issues early

2. **Generate test report**
   - Creates JaCoCo coverage report using `./gradlew jacocoTestReport`
   - Runs with `if: always()` to generate reports even if tests fail
   - Uses `continue-on-error: true` to not block the build if report generation fails

3. **Upload test results**
   - Uploads test reports and results as artifacts
   - Includes both HTML reports and XML test results
   - Retained for 30 days for debugging
   - Runs with `if: always()` to upload results even if tests fail

4. **Upload coverage report**
   - Uploads JaCoCo coverage reports as artifacts
   - Helps track code coverage over time
   - Retained for 30 days
   - Runs with `if: always()` to upload even if tests fail

## Benefits

### 1. **Early Failure Detection**
- Tests run before building the plugin
- Catches issues before creating artifacts
- Saves CI time by failing fast

### 2. **Test Visibility**
- Test results uploaded as artifacts
- Easy to download and review HTML reports
- Can see which tests passed/failed without checking logs

### 3. **Coverage Tracking**
- JaCoCo reports show code coverage
- Helps identify untested code
- Can track coverage trends over time

### 4. **Debugging Support**
- Test results available even when tests fail
- Coverage reports help identify problematic areas
- 30-day retention allows historical analysis

## Workflow Execution Order

```
1. Checkout code
2. Set up JDK 17
3. Setup Gradle
4. Cache Gradle packages
5. Set plugin version
6. Ensure Gradle wrapper is executable
7. Warm IntelliJ Platform cache
8. ✨ Run Rider plugin tests (NEW)
9. ✨ Generate test report (NEW)
10. ✨ Upload test results (NEW)
11. ✨ Upload coverage report (NEW)
12. Build Rider plugin
13. Verify plugin artifact
14. Rename artifact
15. Upload plugin artifact
```

## Artifacts Generated

### Per Build
1. **rider-test-results-{version}**
   - Location: `Rider/build/reports/tests/`
   - Location: `Rider/build/test-results/`
   - Contains: HTML test reports and XML results

2. **rider-coverage-report-{version}**
   - Location: `Rider/build/reports/jacoco/`
   - Contains: JaCoCo coverage reports (HTML and XML)

3. **plugin-distribution-{version}** (existing)
   - Contains: Built plugin ZIP file

## Accessing Test Results

### Via GitHub Actions UI
1. Go to the Actions tab
2. Click on a workflow run
3. Scroll to "Artifacts" section
4. Download `rider-test-results-{version}` or `rider-coverage-report-{version}`

### Viewing Reports
- **Test Results**: Open `build/reports/tests/test/index.html` in a browser
- **Coverage**: Open `build/reports/jacoco/test/html/index.html` in a browser

## Configuration

### Timeouts
- Test execution: 10 minutes
- Can be adjusted if tests take longer

### Retention
- All artifacts: 30 days
- Can be adjusted based on storage needs

## Future Enhancements

1. **Test Result Publishing**
   - Use `dorny/test-reporter` action to publish results as PR comments
   - Add coverage badges to README

2. **Coverage Thresholds**
   - Fail build if coverage drops below threshold
   - Configure minimum coverage requirements

3. **Parallel Testing**
   - Split tests into multiple jobs for faster execution
   - Run different test suites in parallel

4. **Performance Testing**
   - Add performance benchmarks
   - Track test execution time trends

## Troubleshooting

### Tests Fail in CI but Pass Locally
- Check Java version (CI uses JDK 17)
- Verify Gradle version matches
- Check for environment-specific dependencies

### Test Timeout
- Increase timeout in workflow file
- Investigate slow tests
- Consider splitting into multiple jobs

### Coverage Report Not Generated
- Check if tests ran successfully
- Verify JaCoCo plugin is configured in `build.gradle.kts`
- Check Gradle logs for errors

## Related Files
- `.github/workflows/build-and-release.yml` - Main workflow file
- `Rider/build.gradle.kts` - Gradle build configuration with JaCoCo
- `Rider/src/test/` - Test source directory

