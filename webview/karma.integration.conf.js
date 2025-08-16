// Karma configuration for integration tests
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {
        // you can add configuration options for Jasmine here
        // the possible options are listed at https://jasmine.github.io/api/edge/Configuration.html
        // for example, you can disable the random execution order
        random: true
      },
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true // removes the duplicated traces
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/integration'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcov' }
      ],
      check: {
        global: {
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80
        }
      }
    },
    reporters: ['progress', 'kjhtml', 'coverage'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ['ChromeHeadless'],
    singleRun: true,
    restartOnFileChange: false,
    
    // Custom configuration for integration tests
    files: [
      // Include integration test files specifically
      'src/**/*.integration.spec.ts'
    ],
    
    // Exclude unit tests
    exclude: [
      'src/**/*.spec.ts',
      '!src/**/*.integration.spec.ts'
    ],

    // Custom preprocessors for integration tests
    preprocessors: {
      'src/**/*.integration.spec.ts': ['coverage']
    },

    // Browser configuration for CI/CD
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-dev-shm-usage'
        ]
      }
    },

    // Timeout configuration for integration tests
    browserDisconnectTimeout: 10000,
    browserDisconnectTolerance: 3,
    browserNoActivityTimeout: 60000,
    captureTimeout: 60000,

    // Memory management
    browserSocketTimeout: 20000,
    
    // Custom middleware for test data
    middleware: ['custom-middleware'],
    plugins: [
      ...config.plugins,
      {
        'middleware:custom-middleware': ['factory', function() {
          return function(req, res, next) {
            // Add custom headers for integration tests
            res.setHeader('X-Test-Environment', 'integration');
            next();
          };
        }]
      }
    ]
  });

  // CI-specific configuration
  if (process.env.CI) {
    config.browsers = ['ChromeHeadlessCI'];
    config.singleRun = true;
    config.autoWatch = false;
  }
};