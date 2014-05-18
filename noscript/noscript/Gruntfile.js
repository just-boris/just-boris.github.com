/*global module*/
module.exports = function (grunt) {
    'use strict';

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-mocha');

    var gruntConfig = {};
    gruntConfig.jshint = {
        options: {
            jshintrc: '.jshintrc'
        },
        files: [
            'src/*.js'
        ]
    };

    gruntConfig.mocha = {
        options: {
            bail: true,
            log: true
        },
        index: ['test/index.html']
    };

    grunt.initConfig(gruntConfig);

    grunt.registerTask('default', ['mocha', 'jshint']);
};
