'use strict';

var R = require('ramda');
var P = require('bluebird');
var Immutable = require('immutable');
var Stats = require('fast-stats').Stats;

function Population(options) {
  var Options = Immutable.Record({
    populationSize: 100,
    cullPercentage: 10,
    minimizeFitness: false
  });
  this.options = new Options(options);
  this.generation = 0;
  // Members is a list of chromosomes
  this.members = Immutable.List();
  this.compareChromosomes = R.partial(compareChromosomes, this.options);
}

var getFitness = R.prop('fitness');

/**
 * Define a comparator for chromosomes depending on whether we minimizeFitness or not
 * @param  {Object} options minimizeFitness
 * @param  {Number} a fitness for a
 * @param  {Number} b fitness for b
 * @return {Number} sort order
 */
var compareChromosomes = function compareChromosomes(options, a, b) {
  if (a === b) {
    return 0;
  }
  if (options.minimizeFitness) {
    return a > b ? 1 : -1;
  }
  return a < b ? 1 : -1;
}

Population.prototype.calculateFitness = function calculateFitness(fitnessFunc) {
  function calcFitness(chromosome) {
    return fitnessFunc(chromosome)
      .then(function setFitness(fitness) {
        chromosome.setFitness(fitness);
        return chromosome;
      });
  }

  return P.all(this.members.map(calcFitness).toArray());
};

Population.prototype.seed = function seed(seedFunc) {
  var self = this;
  var getChromosomePromises = Immutable.Range(0, Infinity)
    .map(R.nAry(0, seedFunc))
    .takeUntil(function isFullPopulation(chromosome, iteration) {
      return iteration === self.options.populationSize;
    })
    .toArray();

  var addAllToPopulation = R.forEach(this.addMember.bind(this));
  return P.all(getChromosomePromises)
    .then(addAllToPopulation);
};

Population.prototype.cull = function cull() {
  var sortedMemebers = this.members.sortBy(getFitness, this.compareChromosomes);

  // Find the number to take.
  var cullDecimal = this.options.cullPercentage / 100;
  var numberToTake = Math.round(this.members.size * (1 - cullDecimal));
  var newMembers = sortedMemebers.take(numberToTake);

  this.members = newMembers;
  return P.resolve();
};

Population.prototype.fillByBreeding = function fillByBreeding(breedFunc) {
  if (this.members.size >= this.options.populationSize) {
    return P.resolve(this.members);
  }
  // TODO: Members just bread will go back into list for selection!
  var parent1 = this.getRandomChromosome();
  var parent2 = this.getRandomChromosome();
  var self = this;
  return breedFunc(parent1, parent2)
    .then(self.addMember.bind(self))
    .then(function callRecursive() {
      // Keep filling until we reach the right population size
      return self.fillByBreeding(breedFunc);
    });
};

Population.prototype.addMember = function addMember(chromosome) {
  this.members = this.members.push(chromosome);
};

Population.prototype.getMembers = function getMembers() {
  return this.members;
};

Population.prototype.getRandomChromosome = function getRandomChromosome() {
  var index = Math.floor(Math.random() * this.members.size);
  return this.members.skip(index).take(1).get(0);
};

Population.prototype.getFittestChromosome = function getFittestChromosome() {
  var nonNullMembers = this.members.filterNot(R.compose(R.isNil, getFitness));
  if (this.options.minimizeFitness) {
    return nonNullMembers.minBy(getFitness);
  }
  return nonNullMembers.maxBy(getFitness);
};

Population.prototype.incrementGeneration = function increaseGeneration() {
  this.generation++;
};

module.exports = Population;
