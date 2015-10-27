'use strict';

var chai = require('chai'),
    sinon = require('sinon'),
    sinonChai = require('sinon-chai'),
    clone = require('clone'),
    ElasticsearchBulkWritable = require('../');

chai.use(sinonChai);

var expect = chai.expect;

var recordFixture = require('./fixture/record.json');
var successResponseFixture = require('./fixture/success-response.json');
var errorResponseFixture = require('./fixture/error-response.json');

describe('ElastisearchBulkWritable', function() {
    beforeEach(function() {
        this.sinon = sinon.sandbox.create();
    });

    afterEach(function() {
        this.sinon.restore();
    });

    describe('constructor', function() {
        it('should require client', function() {
            expect(function() {
                new ElasticsearchBulkWritable();
            }).to.Throw(Error, 'client is required');
        });

        it('should default highWaterMark to 64', function() {
            var stream = new ElasticsearchBulkWritable({});

            expect(stream.highWaterMark).to.eq(64);
        });
    });

    describe('queue', function() {
        beforeEach(function() {
            this.stream = new ElasticsearchBulkWritable({}, { highWaterMark: 10 });
        });

        it('should queue up number of items equal to highWaterMark', function(done) {
            this.sinon.stub(this.stream, '_flush').yields();

            for (var i = 0; i < 8; i++) {
                this.stream.write(recordFixture);
            }

            this.stream.write(recordFixture, function() {
                expect(this.stream._flush).to.not.have.been.called;

                this.stream.write(recordFixture, function() {
                    expect(this.stream._flush).to.have.been.calledOnce;

                    done();
                }.bind(this));
            }.bind(this));
        });

        it('should flush queue if stream is closed', function(done) {
            this.sinon.stub(this.stream, '_flush').yields();

            this.stream.end(recordFixture, function() {
                expect(this.stream._flush).to.have.been.calledOnce;

                done();
            }.bind(this));
        });
    });

    describe('flushing', function() {
        function getMissingFieldTest(fieldName) {
            return function(done) {
                this.stream.on('error', function(error) {
                    expect(error).to.be.instanceOf(Error);
                    expect(error.message).to.eq(fieldName + ' is required');

                    done();
                });

                var fixture = clone(recordFixture);
                delete fixture[fieldName];

                this.stream.end(fixture);
            };
        }

        beforeEach(function() {
            this.client = {
                bulk: this.sinon.stub()
            };

            this.stream = new ElasticsearchBulkWritable(this.client);
        });

        it('should write records to elasticsearch', function(done) {
            this.client.bulk.yields(null, successResponseFixture);

            this.stream.end(recordFixture, function() {
                expect(this.client.bulk).to.have.been.called;

                done();
            }.bind(this));
        });

        it('should trigger error on elasticsearch error', function(done) {
            this.client.bulk.yields('Fail');

            this.stream.on('error', function(error) {
                expect(error).to.eq('Fail');

                done();
            });

            this.stream.end(recordFixture);
        });

        it('should trigger error on bulk errors', function(done) {
            this.client.bulk.yields(null, errorResponseFixture);

            this.stream.on('error', function(error) {
                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.deep.eq('InternalServerError,Forbidden');

                done();
            });

            this.stream.write(recordFixture);
            this.stream.end(recordFixture);
        });

        it('should throw error on index missing in record', getMissingFieldTest('index'));

        it('should throw error on type missing in record', getMissingFieldTest('type'));

        it('should throw error on id missing in record', getMissingFieldTest('id'));

        it('should throw error on body missing in record', getMissingFieldTest('body'));
    });
});
